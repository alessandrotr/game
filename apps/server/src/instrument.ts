import * as Sentry from '@sentry/node';

/**
 * Sentry initialisation, kept in its own module so it can be the very first
 * import in index.ts — ESM evaluates imports in source order, so importing this
 * before express/colyseus/pg lets Sentry's auto-instrumentation wrap them.
 *
 * This module loads apps/server/.env itself: it runs before index.ts's own
 * `loadEnvFile()` call, so SENTRY_DSN wouldn't be set yet otherwise. The
 * `@sentry/node` import is hoisted above this, but it reads no env at import
 * time — only `Sentry.init()` does, and that runs after the load below.
 */
try {
  (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
  /* no .env file — fine (prod injects env directly) */
}

// Production only: skip Sentry in local dev (tsx) so dev errors don't burn the
// free-tier quota. NODE_ENV must be 'production' on the host (Render) — the same
// flag index.ts already uses for IS_PROD.
const dsn = process.env.SENTRY_DSN;
if (dsn && process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Errors only — no performance tracing — to stay within the free-tier quota.
    tracesSampleRate: 0,
  });
  console.log('🛰️  Sentry error reporting enabled');
}
