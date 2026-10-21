# Unified SalonPro app — architecture

Status: **implemented in 2.0.0** (the decisions in §10 are confirmed).
Scope: merge `mobile-customer` + `mobile-admin` into one binary with three
workspaces and one server-enforced permission model.

The unified app lives in `apps/mobile` and keeps the package
`com.salonpro.app`. The old `apps/mobile-customer` and `apps/mobile-admin`
projects remain in the tree as frozen 1.0.5 reference builds; new work happens
in `apps/mobile`.

## 1. Product hierarchy

```
Platform admin (super_admin)
        │  owns the SaaS, onboards/suspends salons
        ▼
Vendor (salon)
  salon_owner
  branch_manager
  receptionist
  salon_staff
        │  serves their customers
        ▼
Client (customer)
```

The words change; the database roles stay the same for compatibility:

| Product word | Existing role | Workspace |
|---|---|---|
| Platform admin | `super_admin` | Platform |
| Vendor owner | `salon_owner` | Vendor |
| Vendor manager | `branch_manager` | Vendor |
| Vendor reception | `receptionist` | Vendor |
| Vendor staff | `salon_staff` | Vendor |
| Client | `customer` | Client |

A "vendor" is a salon tenant, not a person. The platform can hold many salons;
each salon has its own owner, branches, staff and customers.

## 2. One app, three workspaces

One React Native project, one package (`com.salonpro.app`), one APK. After
sign-in the session decides which workspace is mounted; a client never sees a
vendor route tree at all.

```
App
└─ AuthProvider
   └─ UpdateProvider
      └─ NavigationContainer
         └─ RootNavigator
            ├─ no session ................ AuthNavigator (SignIn)
            ├─ workspace = client ....... ClientNavigator
            ├─ workspace = vendor ....... VendorNavigator
            └─ workspace = platform ..... PlatformNavigator
```

### Client workspace (existing customer app)

`Home · Book · Visits · Wallet · Profile`

Pushed screens: visit detail, offers, referral, notifications, profile edit,
server address.

### Vendor workspace (reused admin screens)

Bottom tabs are **built from permissions**, not hard-coded by role:

| Tab | Required permission |
|---|---|
| Today | `salon.report.read` |
| Schedule | `salon.appointment.read` |
| Customers | `salon.customer.read` |
| Money | `salon.payment.read` or `salon.payment.refund` |
| More | always |

`More` shows only rows the caller can use: analytics, staff, services, offers,
reminders, salon settings, users, audit. A stylist gets Schedule + More (not
Today/Customers/Money); a receptionist gets Schedule + Customers + Money + More;
a manager and the owner get everything the catalog allows.

This is the same visual language as the old admin app, so the screens were
reused — only the navigator and permission predicates changed. Mutation
affordances on the reused screens are hidden when the caller lacks the matching
permission (for example, a stylist sees the service menu read-only).

### Platform workspace (new)

`Overview · Salons · Vendors · Audit · Account`

- **Overview** — number of salons, active/suspended, owners, clients, bookings
  and completed service value across the platform (aggregate only). It is
  labelled "completed value", not GMV, because it is the sum of completed
  `service_records.finalAmount`; it is not a payment-processor settlement
  figure.
- **Salons** — list, search, status; create salon; open a salon's summary;
  suspend/reactivate.
- **Vendors** — owner accounts and invitations; which salon they own.
- **Audit** — cross-salon platform actions (salon created, suspended, owner
  invited), with actor and timestamp.
- **Account** — identity, app version, server address, sign out, update check.

`buildSessionUser()` gives a platform session `salonId = null`; it never falls
back to the first salon. The temporary compatibility exception is that
`super_admin` still carries the salon permission bundle and can use `/admin/*`
with the old first-salon scope until audited support mode replaces it.

## 3. Permission catalog

Permissions are the contract. Roles are only bundles of permissions.

### Platform

| Permission | Meaning |
|---|---|
| `platform.metrics.read` | Platform-wide counts and GMV |
| `platform.salon.read` | List/view salons |
| `platform.salon.manage` | Create, edit, suspend, reactivate salons |
| `platform.vendor.read` | List owners/vendors |
| `platform.vendor.invite` | Create an owner invitation |
| `platform.audit.read` | Cross-salon audit log |

### Vendor / salon

| Permission | Owner | Manager | Reception | Staff |
|---|:---:|:---:|:---:|:---:|
| `salon.read` | ✓ | ✓ | ✓ | ✓ |
| `salon.settings.manage` | ✓ | – | – | – |
| `salon.branch.read` | ✓ | ✓ | ✓ | ✓ |
| `salon.branch.manage` | ✓ | – | – | – |
| `salon.service.read` | ✓ | ✓ | ✓ | ✓ |
| `salon.service.manage` | ✓ | ✓ | – | – |
| `salon.staff.read` | ✓ | ✓ | – | – |
| `salon.staff.manage` | ✓ | ✓ | – | – |
| `salon.customer.read` | ✓ | ✓ | ✓ | – |
| `salon.customer.manage` | ✓ | ✓ | ✓ | – |
| `salon.appointment.read` | ✓ | ✓ | ✓ | ✓ (own) |
| `salon.appointment.manage` | ✓ | ✓ | ✓ | – |
| `salon.appointment.complete` | ✓ | ✓ | ✓ | ✓ |
| `salon.payment.read` | ✓ | ✓ | ✓ | – |
| `salon.payment.collect` | ✓ | ✓ | ✓ | – |
| `salon.payment.refund` | ✓ | ✓ | – | – |
| `salon.wallet.adjust` | ✓ | – | – | – |
| `salon.report.read` | ✓ | ✓ | – | – |
| `salon.offer.read` | ✓ | ✓ | – | – |
| `salon.offer.manage` | ✓ | – | – | – |
| `salon.reminder.read` | ✓ | ✓ | – | – |
| `salon.reminder.manage` | ✓ | – | – | – |
| `salon.referral.read` | ✓ | ✓ | – | – |
| `salon.referral.manage` | ✓ | – | – | – |
| `salon.user.manage` | ✓ | – | – | – |
| `salon.audit.read` | ✓ | – | – | – |

### Client

`client.profile.read`, `client.profile.manage`, `client.booking.read`,
`client.booking.create`, `client.booking.cancel`, `client.wallet.read`,
`client.payment.create`, `client.offer.read`, `client.referral.read`,
`client.notification.read`.

### Server is authoritative

- `/auth/otp/verify`, `/auth/dev-login`, `/auth/demo-login` and `/auth/me` return
  a `user` object that includes `permissions: Permission[]` and
  `workspace: 'platform' | 'vendor' | 'client'`.
- Every sensitive route uses `requirePermission('...')`.
- The mobile app uses the same catalog only to decide what to render. A hidden
  tab is not security.
- Existing `can.*` helpers become thin wrappers over the catalog during the
  migration, so old routes keep working while new routes use permissions.

## 4. API surface

### Auth / session

```
POST /api/auth/otp/request
POST /api/auth/otp/verify       -> { token, user: { permissions, workspace, ... }, wallet }
POST /api/auth/dev-login
POST /api/auth/demo-login
GET  /api/auth/me               -> { user: { permissions, workspace, ... }, wallet }
POST /api/auth/logout
```

`user` gains no new role names; `permissions` is the union for the role. If a
user can hold several roles later, the union is computed from memberships and
the active membership.

### Platform (new, guarded by `platform.*`)

```
GET   /api/platform/overview
GET   /api/platform/salons
POST  /api/platform/salons
GET   /api/platform/salons/:id
PATCH /api/platform/salons/:id
GET   /api/platform/vendors
GET   /api/platform/audit
```

There is deliberately no separate "invite a vendor without a salon" route in
v1: one salon per user means an owner account is only useful with its tenant.
`POST /platform/salons` creates, in one transaction: salon, first branch,
default salon settings, three standard recharge offers, owner user
(`role = salon_owner`, `status = invited`). No SMS is claimed; the owner signs in
with OTP when they have a code. `platform.vendor.invite` remains in the catalog
for the future invitation flow.

Suspending a salon is enforced in `buildSessionUser()`: any non-platform session
scoped to that salon resolves to `null`, and the login paths revoke the token
they just minted instead of returning a broken session. Reactivating the salon
restores access to existing, unrevoked sessions.

### Vendor / client

Existing `/api/admin/*` and `/api/customer/*` routes stay. `/api/admin/*` gets
permission guards and a `salonId` scope; `/api/customer/*` stays ownership-scoped
by customer id.

## 5. Data model changes

Minimal, additive:

```sql
ALTER TABLE salons ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS trialEndsAt TEXT;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS updatedAt TEXT;
CREATE INDEX IF NOT EXISTS idx_salons_status ON salons(status);
```

Bump `SCHEMA_VERSION`; `ensureSchema()` already runs idempotent migrations on the
next boot. No table drops, no data rewrite.

`audit_logs` already records actor/entity/metadata and is the platform audit
source. Platform actions write `entityType = 'salon'` or `'vendor'`.

## 6. Multi-salon membership: not in v1

Today `users.role` is global and `buildSessionUser()` resolves exactly one salon.
That is enough for the immediate requirement: the platform has many salons, and
each salon has its own owner and staff. It is **not** enough for one person to
work at two salons.

Decision: do not add a `salon_members` table yet. It would require changing
session scoping, every `req.auth.salonId` use, branch authorization, invites and
tests — a large change with no current user need.

When it is needed, add:

```sql
CREATE TABLE salon_members (
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  salonId TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  PRIMARY KEY (userId, salonId)
);
```

and make the session carry `activeSalonId` + the role for that salon. The
permission catalog above does not change.

## 7. ORM decision: no ORM now

The app does **not** use Prisma or Drizzle today. It uses `packages/core/src/db.ts`
— a small typed query layer over `pg` (Neon) and PGlite (tests), with
`one/all/run/scalar/tx`, real transactions and an idempotent schema.

**Prisma: no.** Binary engines/codegen add runtime and CI weight; PGlite is not a
first-class target; the migration would rewrite 30+ tables and hundreds of SQL
statements for no user-facing gain. It is a poor fit for this Vercel + Bun +
PGlite setup.

**Drizzle: the only viable candidate, but still no for now.** It supports PGlite
and Neon, and would give typed schema/queries. But the existing queries include
analytics, ledger and availability SQL that would all have to be rewritten and
re-tested. Mixing Drizzle and hand-written SQL is worse than one consistent
layer. Adopt Drizzle only if we start a new service or the schema/query churn
becomes painful; do not migrate just to have an ORM.

If type safety is the immediate concern, add typed repository functions on top of
`one/all` for the tables touched by the new platform code. That is a small,
incremental improvement with no runtime change.

## 8. Package and migration path

Existing installs:

| App | Package | Version |
|---|---|---|
| SalonPro (customer) | `com.salonpro.app` | 1.0.5 |
| SalonPro Admin | `com.salonpro.admin` | 1.0.5 |
| SalonPro (unified) | `com.salonpro.app` | 2.0.0 |

The unified app keeps **`com.salonpro.app`** and the name **SalonPro**. This lets
the installed customer app self-update through the existing updater. The admin
package is retired.

Consequences:

- Customers: 1.0.5 → 2.0.0 in-app update works normally (versionCode 7).
- Admin users: Android refuses to install a different package over
  `com.salonpro.admin`. They install the unified APK once, manually, then use one
  app. Server data is unchanged; they sign in with the same phone.
- The 1.0.5 admin build stays available as a bridge but cannot self-migrate to a
  different package; the release notes say so plainly.
- The 2.0.0 asset is named `mobile-customer-2.0.0.apk` so 1.0.5 customer
  updaters can find it. The unified build sets `APP_FLAVOR = 'customer'` for the
  same reason; this is an asset prefix, not the app's identity. From 2.0.1 the
  updater may also accept a `salonpro-` prefix while keeping old prefixes.
- Signed with the same debug certificate as 1.0.4/1.0.5
  (`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`).
  The debug keystore is not committed; the build script expects the existing
  local keystore in `apps/mobile/android/app/debug.keystore`.

## 9. Delivery status

### Phase 0 — updater test (done)

1.0.5, versionCode 6, both packages, published as `mobile-1.0.5`. Purpose:
prove prompt → download progress → SHA-256 → Android installer from an installed
1.0.4. No architecture changes rode along.

### Phase 1 — server foundation (done)

- Permission catalog + role matrix in `packages/shared`.
- `SessionUser.permissions` and `SessionUser.workspace` returned by every login
  and `/auth/me`.
- `requirePermission`; existing `can.*` helpers wrap the catalog.
- Salon `status`, `plan`, `trialEndsAt`, `updatedAt`; `SCHEMA_VERSION = '2'`.
- Platform routes with tests: create salon/branch/owner/offers, suspend,
  reactivate, audit, duplicate-phone rejection, suspended-session rejection.

### Phase 2 — unified binary (done)

- `apps/mobile` created from the customer shell; client screens under
  `screens/client`, vendor screens under `screens/vendor`, platform screens under
  `screens/platform`.
- `RootNavigator`, `ClientNavigator`, `VendorNavigator`, `PlatformNavigator`.
- One app.json / Gradle package / build target. Old apps frozen as 1.0.5
  reference builds.
- 2.0.0 built with versionCode 7 and the 1.0.5 certificate.

### Phase 3 — vendor permission polish (done)

- Permission-driven tabs and More rows.
- Reused screens; mutation controls hidden where the role lacks the permission
  (Services is read-only for staff/reception; Offers/Reminders/Settings and
  wallet adjustment remain owner-only; refunds are owner/manager).
- Verified by typecheck and the server's role/route tests. On-device manual
  verification of each role is still pending a connected phone.

### Phase 4 — platform console (done)

- Overview, salons, vendors, audit, account screens.
- Salon creation + invited owner.
- Suspend/reactivate with audit entries.

### Phase 5 — optional

- Multi-salon membership (`salon_members`) and workspace switcher.
- Audited "enter salon" support mode.
- Drizzle only if a concrete need appears.

## 10. Confirmed decisions

1. **Package**: keep `com.salonpro.app` for the unified app; admin users install
   once manually. `com.salonpro.admin` is retired.
2. **Platform admin scope**: platform console only in v1, with the existing
   salon permissions preserved temporarily for compatibility. Audited support
   mode comes later.
3. **Multi-salon membership**: one salon per user in v1. No `salon_members`
   table yet.
4. **ORM**: no ORM now. Prisma is a poor fit; Drizzle is the only viable future
   candidate but rewriting tested SQL is not justified.

The permission catalog and workspace routing are independent of the deferred
items.
