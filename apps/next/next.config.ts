import type { NextConfig } from 'next';

/**
 * SalonPro's server side: route handlers on Vercel.
 *
 * The API itself lives in `@salonpro/core` (framework-free business logic) and
 * is exposed by `app/api/[...path]/route.ts`; this config only wires the
 * workspace packages into the build and serves the built customer/admin SPA
 * from the same origin as the API.
 */
const config: NextConfig = {
  /* The API package is TypeScript source, not a prebuilt bundle. */
  transpilePackages: ['@salonpro/core', '@salonpro/shared'],

  /* Native/database drivers must not be bundled: `pg` opens sockets and PGlite
   * ships a wasm build + worker files that a bundler cannot inline. */
  serverExternalPackages: ['pg', '@electric-sql/pglite'],

  poweredByHeader: false,

  /* The Vite SPA (`apps/web/dist`, copied to `public/site` by
   * `scripts/build-next.sh`) is served under /app, so the web app and the API
   * share an origin and browser requests stay same-origin. */
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        { source: '/app', destination: '/site/index.html' },
        { source: '/app/:path*', destination: '/site/:path*' },
      ],
      /* Client-side routes (react-router) that are not files fall back to the
       * app shell. */
      fallback: [{ source: '/app/:path*', destination: '/site/index.html' }],
    };
  },
};

export default config;
