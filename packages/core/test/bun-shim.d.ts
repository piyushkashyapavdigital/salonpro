/**
 * Bun ships its own test runner and its types live in `bun:test` (via
 * `@types/bun`). Rather than add that dependency, we map the handful of names
 * we use onto Node's test types — Bun's runner accepts the same calls — so
 * `tsc` typechecks the suite with the node types already installed. Node calls
 * the once-per-file hooks `before`/`after`; Bun calls them `beforeAll`/`afterAll`,
 * so the two are bridged here.
 */
declare module 'bun:test' {
  export { test, describe, beforeEach, afterEach } from 'node:test';
  export { before as beforeAll, after as afterAll } from 'node:test';
}
