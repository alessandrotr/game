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

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Errors only — no performance tracing — to stay within the free-tier quota.
    tracesSampleRate: 0,
  });
  console.log('🛰️  Sentry error reporting enabled');
}
