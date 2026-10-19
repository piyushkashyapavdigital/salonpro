import type { NextConfig } from 'next';

/**
 * SalonPro's server side: the API, on Vercel (or on this machine behind
 * `scripts/serve.sh`).
 *
 * The API itself lives in `@salonpro/core` (framework-free business logic) and
 * is exposed by `app/api/[...path]/route.ts`; this config only wires the
 * workspace packages into the build.
 */
const config: NextConfig = {
  /* The API package is TypeScript source, not a prebuilt bundle. */
  transpilePackages: ['@salonpro/core', '@salonpro/shared'],

  /* Native/database drivers must not be bundled: `pg` opens sockets and PGlite
   * ships a wasm build + worker files that a bundler cannot inline. */
  serverExternalPackages: ['pg', '@electric-sql/pglite'],

  poweredByHeader: false,
};

export default config;
