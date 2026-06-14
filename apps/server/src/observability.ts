import * as Sentry from '@sentry/node';
import type { TokenClaims } from './auth.js';

/**
 * Server-side error capture helpers. Sentry is only initialised in production
 * (see instrument.ts), so `captureException` is a no-op in dev — the console
 * logging here still runs, so local debugging is unaffected. Keeping these in
 * one module means room code doesn't each import `@sentry/node`.
 */

/** Everything we know about the user behind a captured error — attached to the
 *  Sentry event so a crash is tied to an account, not just a stack trace.
 *  Mirrors Sentry's user shape (`id`/`username`/`ip_address` are special-cased
 *  in the UI; any extra keys show up under the user section). */
export interface ErrorUser {
  /** Account id — Sentry's stable per-user key (drives "users affected"). */
  id?: string;
  /** Display name. */
  username?: string;
  /** Originating IP; pass a request IP, or `'{{auto}}'` to let Sentry infer it. */
  ip_address?: string;
  [key: string]: unknown;
}

/** Build an {@link ErrorUser} from verified token claims (+ optional request IP).
 *  Returns undefined when there are no claims, so callers can pass it straight
 *  through without a guard. */
export function userFromClaims(
  claims: TokenClaims | null | undefined,
  ip?: string,
): ErrorUser | undefined {
  if (!claims) return ip ? { ip_address: ip } : undefined;
  const id = claims.pid !== undefined ? String(claims.pid) : claims.gid;
  return { id, username: claims.name, ip_address: ip };
}

/** Log + capture a caught server error, tagged with where it happened plus any
 *  room/session/user context. Use in `catch` blocks that already recover
 *  gracefully — this just makes the swallowed error visible in Sentry. */
export function captureServerError(
  err: unknown,
  ctx: {
    message: string;
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    /** The user behind the error (account id + name + IP), when known. */
    user?: ErrorUser;
  },
): void {
  console.error(ctx.message, err);
  Sentry.withScope((scope) => {
    if (ctx.tags) scope.setTags(ctx.tags);
    if (ctx.extra) scope.setExtras(ctx.extra);
    if (ctx.user) scope.setUser(ctx.user);
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
