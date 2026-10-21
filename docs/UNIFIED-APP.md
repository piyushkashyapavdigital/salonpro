# Unified SalonPro app — architecture

Status: proposed, pending sign-off on the three decisions in §10.
Scope: merge `mobile-customer` + `mobile-admin` into one binary with three
workspaces and one server-enforced permission model.

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
            ├─ signed out ................ SignInStack
            ├─ role customer ............ ClientNavigator
            ├─ vendor role .............. VendorNavigator
            └─ role super_admin ......... PlatformNavigator
```

### Client workspace (existing customer app)

`Home · Book · Visits · Wallet · Profile`

Pushed screens: visit detail, offers, referral, notifications, profile edit,
server address.

### Vendor workspace (existing admin app)

Bottom tabs are **built from permissions**, not hard-coded by role:

| Tab | Required permission |
|---|---|
| Today | `salon.report.read` |
| Schedule | `salon.appointment.read` |
| Customers | `salon.customer.read` |
| Money | `salon.payment.read` or `salon.payment.refund` |
| More | always |

`More` shows only rows the caller can use: analytics, staff, services, offers,
reminders, salon settings, users, audit. A stylist gets Today + Schedule + More
(not Customers/Money); a receptionist gets Schedule + Customers + More; an owner
gets everything.

This is the same visual language as today, so no screen rewrite is needed — only
a different navigator and permission predicates.

### Platform workspace (new)

`Overview · Salons · Vendors · Audit · Account`

- **Overview** — number of salons, active/trial/suspended, customers, bookings,
  GMV across the platform (aggregate only).
- **Salons** — list, search, status; create salon; open a salon's summary;
  suspend/reactivate.
- **Vendors** — owner accounts and invitations; which salon they own.
- **Audit** — cross-salon platform actions (salon created, suspended, owner
  invited), with actor and timestamp.
- **Account** — identity, app version, server address, sign out, update check.

Platform admin must **not** fall back to "the first salon" the way
`buildSessionUser()` does today. A platform session has `salonId = null` unless
the admin explicitly enters a salon through an audited support action.

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
| `salon.offer.manage` | ✓ | – | – | – |
| `salon.reminder.manage` | ✓ | – | – | – |
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
  `permissions: Permission[]` alongside `user`.
- Every sensitive route uses `requirePermission('...')`.
- The mobile app uses the same catalog only to decide what to render. A hidden
  tab is not security.
- Existing `can.*` helpers become thin wrappers over the catalog during the
  migration, so old routes keep working while new routes use permissions.

## 4. API surface

### Auth / session

```
POST /api/auth/otp/request
POST /api/auth/otp/verify       -> { token, user, permissions, wallet }
POST /api/auth/dev-login
POST /api/auth/demo-login
GET  /api/auth/me               -> { user, permissions, wallet }
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
POST  /api/platform/vendors/invite
GET   /api/platform/audit
```

`POST /platform/salons` creates, in one transaction: salon, first branch,
default salon settings, three standard recharge offers, owner user
(`role = salon_owner`, `status = invited`). No SMS is claimed; the owner signs in
with OTP when they have a code.

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

The unified app keeps **`com.salonpro.app`** and the name **SalonPro**. This lets
the installed customer app self-update through the existing updater. The admin
package is retired.

Consequences:

- Customers: 1.0.5 → 2.0.0 in-app update works normally.
- Admin users: Android refuses to install a different package over
  `com.salonpro.admin`. They install the unified APK once, manually, then use one
  app. Server data is unchanged; they sign in with the same phone.
- The 1.0.5 admin build stays available as a bridge but cannot self-migrate to a
  different package; the release notes must say so plainly.
- Keep the 2.0.0 asset named `mobile-customer-2.0.0.apk` so 1.0.5 customer
  updaters can find it. From 2.0.1 the app may also accept a `salonpro-` prefix;
  old prefixes remain supported.

## 9. Phased delivery

### Phase 0 — updater test (this release)

1.0.5, versionCode 6, both packages. Purpose: prove prompt → download progress →
  SHA-256 → Android installer from an installed 1.0.4. No architecture changes
  ride along, so a failure is unambiguous.

### Phase 1 — server foundation (no UI change)

- Add permission catalog + role matrix to `packages/shared`.
- Return `permissions` from auth endpoints.
- Add `requirePermission`.
- Add salon status/plan columns and platform routes.
- Tests: matrix, route guards, platform create/suspend, tenant isolation.

### Phase 2 — unified binary

- Create `apps/mobile` from the customer shell; move client screens under
  `screens/client`, vendor screens under `screens/vendor`.
- Add `RootNavigator`, `ClientNavigator`, `VendorNavigator`, `PlatformNavigator`.
- One app.json / Gradle package / build target. Old apps frozen, then removed.
- Release 2.0.0. Customers update in-app; admin users install manually once.

### Phase 3 — vendor permission polish

- Permission-driven tabs and More rows.
- Reuse the existing screens; no visual rewrite.
- Verify each role manually: owner, manager, receptionist, stylist, client.

### Phase 4 — platform console

- Overview, salons, vendors, audit screens.
- Salon creation + owner invitation.
- Suspend/reactivate with audit entries.

### Phase 5 — optional

- Multi-salon membership (`salon_members`) and workspace switcher.
- Audited "enter salon" support mode.
- Drizzle only if a concrete need appears.

## 10. Decisions to confirm before Phase 1

1. **Package**: keep `com.salonpro.app` for the unified app and require admin
   users to install once manually? (Recommended.) Alternative: keep
   `com.salonpro.admin` and make customers migrate manually.
2. **Platform admin scope**: platform console only in v1, with salon access
   preserved for compatibility, or platform console + explicit audited support
   mode from day one?
3. **Multi-salon membership**: one salon per user for v1 (recommended), or build
   `salon_members` now?
4. **ORM**: no ORM now (recommended), Drizzle now, or Prisma.

The rest of the design does not depend on these answers; the permission catalog
and workspace routing are the same either way.
