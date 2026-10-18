/**
 * Which experience this bundle targets.
 *
 * - `customer` (default): landing page + the customer app + the owner dashboard,
 *   all reachable from one build (see `App.tsx`).
 * - `admin`: dashboard-only build shipped as a *separate* Android app
 *   (`com.salonpro.admin`) so staff get their own launcher icon that opens
 *   straight into the owner dashboard.
 *
 * Chosen at build time with `VITE_APP_MODE=admin` (see the `build:admin` script
 * in `package.json`).
 */
export const APP_MODE: 'customer' | 'admin' =
  (import.meta.env.VITE_APP_MODE as string | undefined) === 'admin' ? 'admin' : 'customer';

/** True when this build is the standalone owner/staff app. */
export const isAdminApp = APP_MODE === 'admin';

/**
 * Where a signed-in user should land, for *this* build.
 *
 * In the admin build everything funnels to `/admin` (a customer who signs in
 * still lands there and is shown the "dashboard access only" screen — the real
 * gate is server-side RBAC either way).
 */
export function homePath(role: string): string {
  if (isAdminApp) return '/admin';
  return role === 'customer' ? '/app' : '/admin';
}
