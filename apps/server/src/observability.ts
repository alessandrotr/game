import * as Sentry from '@sentry/node';

/**
 * Server-side error capture helpers. Sentry is only initialised in production
 * (see instrument.ts), so `captureException` is a no-op in dev — the console
 * logging here still runs, so local debugging is unaffected. Keeping these in
 * one module means room code doesn't each import `@sentry/node`.
 */

/** Log + capture a caught server error, tagged with where it happened plus any
 *  room/session context. Use in `catch` blocks that already recover gracefully —
 *  this just makes the swallowed error visible in Sentry. */
export function captureServerError(
  err: unknown,
  ctx: { message: string; tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  console.error(ctx.message, err);
  Sentry.withScope((scope) => {
    if (ctx.tags) scope.setTags(ctx.tags);
    if (ctx.extra) scope.setExtras(ctx.extra);
    Sentry.captureException(err);
  });
}

const lastTickCaptureAt = new Map<string, number>();
/** Min gap between captures for the same key, so a bad room state that throws
 *  every tick (~30/s) doesn't flood the logs or the Sentry quota. */
const TICK_THROTTLE_MS = 5000;

/**
 * Capture a swallowed simulation-tick error, throttled per key (room). A thrown
 * tick used to bubble to `uncaughtException` and restart the whole process —
 * disconnecting every player in every room. Swallowing + capturing keeps the
 * server (and other rooms) alive while still surfacing the bug in Sentry.
 */
export function captureTickError(key: string, err: unknown, tags: Record<string, string>): void {
  const now = Date.now();
  if (now - (lastTickCaptureAt.get(key) ?? 0) < TICK_THROTTLE_MS) return;
  lastTickCaptureAt.set(key, now);
  console.error(`[${tags.where ?? key}] simulation tick failed (swallowed):`, err);
  Sentry.withScope((scope) => {
    scope.setTags(tags);
    Sentry.captureException(err);
  });
}
