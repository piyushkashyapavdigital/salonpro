# SalonPro — Spec Review (SALONPRO.docx)

A working review of the product specification, the gaps in it, and how the
accompanying build (`packages/core` served through `apps/next` on Vercel, plus
the `apps/mobile-customer` and `apps/mobile-admin` apps) resolves or deliberately defers each
one. Written to be read next to the spec: each section names the issue, gives the
risk, and states the concrete decision taken in code.

---

## 1. Executive summary

The spec is strong on **product intent** (three cohorts, prepaid wallet, referral
rewards, reminders) and weak on **financial and operational mechanics**. The three
risks that would bite hardest in production are:

1. **No double-entry accounting.** Wallet balances, revenue and liabilities are
   described in prose ("balance", "bonus", "revenue") without a single source of
   truth that reconciles money in against money owed. This is where salons lose
   real money.
2. **Wallet bonus/expiry/reconciliation undefined.** The spec never says what
   happens to bonus the salon has already counted, when it expires, or how a
   recharge reversal is handled.
3. **Concurrency and audit-immutability are unaddressed.** Double-booking a
   stylist and double-crediting a payment are the two failure modes that generate
   support tickets, and the spec describes neither the lock strategy nor how the
   audit trail is protected from edits.

Everything below expands these, plus the smaller gaps (timezones, reconciliation,
refund approval, commission payouts, GDPR retention, and notification honesty).

---

## 2. What the spec gets right

- **Correct cohort split** — customer app, owner dashboard, reception/staff
  console are genuinely different tools with different authority, not skins on
  one screen.
- **Prepaid wallet + referral rewards** as the loyalty engine is the right bet for
  Indian salon economics; it locks in repeat visits without discounting the menu.
- **₹500→₹550 / ₹1000→₹1150 / ₹2000→₹2400** is a clean, memorable bonus ladder.
- **₹50 + ₹50 referral, gated on a first completed *paid* visit**, is the correct
  anti-abuse trigger (see §7 for why it is still not enough).

---

## 3. Financial correctness

### 3.1 No double-entry accounting
**Spec:** balances and "revenue" are described as fields to display.
**Risk:** a mutable `balance` column drifts the moment any code path forgets to
write a matching row; refunds, reversals and manual corrections make it worse.
**Build decision:** the wallet is an **append-only ledger** (`wallet_transactions`).
Balances are never stored; they are always `SUM(amount)` over `status='posted'`
rows, split by `balanceType` (`cash` | `bonus`). Corrections are **compensating
entries**, never edits. Cash (real money the salon holds) and bonus (promotional
credit) are separate balance types so the two liabilities never blur.

### 3.2 Payment / wallet liability treatment is unclear
**Spec:** "recharge ₹500, get ₹550" with no statement of what the extra ₹50 is.
**Risk:** the ₹50 is treated as revenue at recharge time, inflating income that
has not been earned, and the salon's true liability (cash owed + bonus owed) is
invisible.
**Build decision:** a recharge posts **two ledger rows**: `+₹500` cash and
`+₹50` bonus. Revenue recognises only **service records** (work actually
delivered). The revenue report exposes `walletCashCollected`,
`walletBonusGranted`, `cashLiability` and `bonusLiability` as **separate** figures
so the owner can see money in versus money owed.

### 3.3 "Revenue" is used to mean three different numbers
**Spec:** one "revenue" figure on the dashboard.
**Risk:** net collected (cash in the till), gross service sales (work done),
and wallet cash collected (a liability, not income) get conflated; decisions are
made on the wrong number.
**Build decision:** `revenueReport` returns them independently —
`grossServiceSales`, `discounts`, `refunds`, `netCollected`, `walletCashCollected`,
`walletBonusGranted`, `cashLiability`, `bonusLiability`, `referralRewardExpense`,
`outstanding` — with a per-day `series`. The dashboard labels each explicitly.

### 3.4 Refund approval workflow omitted
**Spec:** refunds exist but no authority or limit is defined.
**Risk:** any staff member can refund arbitrarily; fraud and honest mistakes alike.
**Build decision:** refunds require the `processRefund` capability (owner or
branch manager). Refunds post a compensating wallet entry with an idempotency
key, so a double-click cannot pay twice, and every refund is audited.

### 3.5 Staff commission payouts missing
**Spec:** no commission/payout records.
**Risk:** stylists are paid from spreadsheets that do not reconcile with the
service records, and disputes are unwinnable.
**Status:** **deferred, called out.** The `service_records` table carries
`staffId` and `finalAmount`, which is the raw material a commission ledger needs,
but a `commission_payouts` table and its lifecycle are not built. This is the
single most valuable next financial feature.

---

## 4. Wallet lifecycle gaps

### 4.1 Bonus expiry undefined
**Spec:** bonus is granted, never discussed after that.
**Risk:** a growing, unbounded promotional liability; or, if expiry is added
later without rules, customers lose money with no warning.
**Build decision:** `settings.referral.bonusExpiryDays` exists (default `null` =
never expires). The ledger already stores `createdAt` per bonus row, so an expiry
sweep can be added as a scheduled job posting `expiry` rows **without schema
change**. The customer wallet UI states the current terms ("Purchased cash value
never expires").

### 4.2 Spending order undefined
**Spec:** silent.
**Risk:** if cash is spent before bonus, the salon burns real money and lets bonus
sit; if bonus before cash, the customer gets the promotional value first.
**Build decision:** explicit `settings.spendingOrder = ['bonus','cash']`. Bonus is
always consumed first. This is asserted by tests
(`packages/core/test/wallet.test.ts` → "promotional bonus is spent before cash").

### 4.3 Recharge reversal / chargeback undefined
**Spec:** silent.
**Risk:** a failed or refunded recharge leaves spendable bonus behind.
**Build decision:** every credit is idempotent by key; a reversal posts a
compensating debit. Because balances are derived, a reversal is always reflected
without a migration.

---

## 5. Concurrency, correctness and audit

### 5.1 Double-booking and double-crediting
**Spec:** not addressed.
**Risk:** two receptionists book the same stylist at 4pm; a webhook and a
client callback both credit the same recharge.
**Build decision:**
- **Booking** runs a check-then-insert inside a `BEGIN IMMEDIATE` transaction on
  a **synchronous** SQLite driver (`node:sqlite`). Synchronous single-threaded
  access makes the check atomic — no interleaving request can slip between the
  conflict query and the insert.
- **Payments** are keyed by unique event id (`claimEvent`) and order idempotency
  keys; a replayed webhook or a second `/verify` returns `credited:false`
  (`reason: already_credited`) rather than double-crediting.
- Both are covered by tests (overlap → 409; replayed recharge → no double credit).

### 5.2 Audit immutability
**Spec:** "audit logs" mentioned; no statement that they are append-only.
**Risk:** if the app can update or delete audit rows, the trail proves nothing.
**Build decision:** `audit_logs` is write-only from the application. There is no
update or delete path in the codebase. Wallet adjustments **require a reason**
(min 6 chars) and write an `wallet.adjust` audit row; the same is true for refunds.
A DB-level `BEFORE UPDATE`/`BEFORE DELETE` trigger is the recommended hardening
step for a hostile-operator threat model (see §10).

### 5.3 Peak-load behaviour
**Spec:** silent.
**Risk:** a Saturday-morning rush or a campaign burst.
**Build decision:** the synchronous driver serialises writes, which is correct but
**not horizontally scalable**. For a single salon this is ample; the migration
path is documented (§10) — move to Postgres with `SERIALIZABLE`/row locks and keep
the same service-layer transaction shape.

---

## 6. Timezones and time handling

**Spec:** silent on timezone. Reminders "day 7/14/30" and appointment slots are
inherently local-time.
**Risk:** a UTC server schedules a 10:00 IST appointment at 04:30 IST, or a
reminder fires a day early.
**Build decision:** each salon has a `timezone` (default `Asia/Kolkata`).
Appointment dates are stored as **local `YYYY-MM-DD`** and times as `HH:MM`
strings — never as UTC instants — so a slot never shifts. Reminder stages are
keyed uniquely per `(customer, visit, stage)`, so a scheduler re-run cannot double
send. The dashboard's "today" is computed in the salon's local date. **Gap:** the
tipping/loyalty month boundary still uses the process clock; a full timezone
library (e.g. `luxon`) per-salon for "month" boundaries is a recommended follow-up.

---

## 7. Referral abuse vectors

**Spec:** ₹50 + ₹50 after the first completed *paid* visit. Correct trigger, but
the spec does not enumerate the attacks.

| Attack | Mitigation in build |
|---|---|
| Self-referral | `resolveAttribution` returns `null` when referrer == referred customer. Tested. |
| Referring an existing customer | Attribution requires the referred user to have **no prior service history**; existing visitors are not attributable. Tested. |
| Farming rewards with throwaway numbers | Reward only fires on a **completed + paid** visit, not on signup. |
| Reward reversal after refund | Refunding the qualifying visit calls `reverseIfQualifyingCancelled`, which posts **compensating** reward entries and flips the referral to `reversed`. Tested. |
| Double reward on re-run | `qualifyForAppointment` is idempotent; re-running adds no second credit. Tested. |
| Monthly payout inflation | `settings.referral.maxRewardsPerMonth` caps payouts. |
| Forged attribution token | The referral token is **signed** (HMAC); a tampered token resolves to `null`. Tested. |
| Fake reversals / replays | Reward rows use idempotency keys; the ledger is append-only. |

**Residual risk (documented):** device/phone farming with genuinely new numbers
and a genuine first visit is indistinguishable from a real referral at this
layer. A device-fingerprint or KYC-lite step is the practical next defence.

---

## 8. Notifications honesty

**Spec:** reminders and notifications are assumed to be "sent".
**Risk:** the UI claims a WhatsApp/push was delivered when no provider is
configured — a trust and compliance problem.
**Build decision:** with no provider keys, delivery is recorded as **`pending`**,
never `sent`. `/health` reports a truthful `integrations` block, the API boot log
says `not configured — reminders recorded as pending (never "sent")`, and the
reminder pass returns counts (`queued`, `pending`, `suppressed`, `skipped`) so the
owner can see exactly what would have gone out. The smoke test asserts reminders
stay `pending` and never fabricate a `sent` state.

---

## 9. Privacy, retention and data rights

**Spec:** silent on GDPR/DPDP style requirements despite storing phone numbers,
visit history and wallet balances.
**Risk:** no deletion path, no export, no retention policy.
**Build decision:** customer-initiated **data export** and **deletion** endpoints
exist in `routes/customer.ts`. Retention windows and a documented erasure SLA are
**not** implemented — this is flagged as a gap. Recommended: a
`data_retention` policy table, soft-delete with PII tokenisation in audit rows,
and a documented lawful basis for processing phone numbers.

---

## 10. Architecture recommendations

1. **Keep the ledger model; add a reconciliation job.** A nightly job that
   recomputes `SUM(ledger)` per wallet and alerts on any drift from the reported
   balance would have caught the class of bug the append-only model already
   prevents. Cheap insurance.
2. **Move to Postgres for multi-tenant scale.** The service layer already funnels
   all money through `tx()`; porting means swapping the driver and tightening
   isolation, not rewriting business logic.
3. **Make the audit log immutable at the DB layer** (`BEFORE UPDATE/DELETE`
   triggers, or an append-only table with revoked UPDATE/DELETE grants).
4. **Add a `commission_payouts` ledger** mirroring the wallet pattern.
5. **Add per-salon timezone handling for all period boundaries**, not just dates.
6. **Add webhook signature + replay tests to CI** (already present as tests here)
   and run the migration test against a copy of production data.

---

## 11. Spec item → build status

| Spec area | Status |
|---|---|
| 3 interfaces (customer / owner / reception+staff) | Built |
| Roles: super_admin, salon_owner, branch_manager, receptionist, salon_staff, customer | Built, RBAC enforced server-side |
| Persistent database | Built (Postgres — Neon in production, PGlite in tests) |
| OTP auth with honest dev-mock labelling | Built |
| Razorpay test mode, server-side verify + signed webhooks | Built (simulated mode without keys; real HMAC math) |
| Wallet offers ₹500→₹550 / ₹1000→₹1150 / ₹2000→₹2400 | Built + tested |
| Referral ₹50 + ₹50 after first completed paid visit | Built + tested |
| Reminders day 7 / 14 / 30 | Built (honest `pending` delivery) |
| Owner analytics incl. Top 20 customers | Built + tested |
| Audit logs | Built (append-only by convention) |
| Append-only ledger | Built + tested |
| Installable PWA | **Removed** by request — the two native APKs are the product (the web UI remains in git history) |
| Refund approval workflow | Built (capability-gated) |
| Staff commission payouts | **Deferred** |
| GDPR/retention specifics | Export/deletion built; retention **deferred** |
| Bonus expiry rules | Setting present; sweep **deferred** |

---

## 12. Verdict

The spec is a good product brief and a poor engineering brief. The build closes
the dangerous financial gaps (ledger, distinct revenue definitions, idempotent
payments, capability-gated refunds, referral reversal) and makes the remaining
gaps **explicit and cheap to add** (commission ledger, bonus expiry sweep,
retention policy, DB-level audit immutability). With those four follow-ups the
platform is defensible; without the ledger and idempotency it would not have been.
