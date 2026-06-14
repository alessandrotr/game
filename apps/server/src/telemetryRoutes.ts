import type { Express } from 'express';

/**
 * Client-error telemetry sink — a self-hosted alternative to a SaaS crash
 * reporter (Sentry et al.). The client POSTs a small structured report whenever
 * it falls back to the JoinScreen (a dropped socket, a room error, a sync/schema
 * failure, a render crash) or hits a global window error. We log it loudly with
 * the originating IP + a server timestamp so rare, hard-to-reproduce drops leave
 * a trail in the normal server logs instead of vanishing in a console nobody was
 * watching.
 *
 * Deliberately dependency-free and unauthenticated: the body is size-capped by
 * `express.json({ limit })` upstream and every field is treated as untrusted —
 * we read a known allowlist of fields and truncate strings before logging.
 */
export function registerTelemetryRoutes(app: Express): void {
  app.post('/client-error', (req, res) => {
    const report = sanitize(req.body as Record<string, unknown>);
    // `​`-free single-line object so log scrapers can grep `[client-error]`.
    console.error('[client-error]', {
      ...report,
      ip: req.ip,
      receivedAt: new Date().toISOString(),
    });
    // 204: the client never reads the response (it's fire-and-forget), so don't
    // spend bytes on a body.
    res.status(204).end();
  });
}

/** Known report kinds — anything else is coerced to 'unknown' so a stale or
 *  malicious client can't inject arbitrary labels into the logs. */
const KINDS = new Set([
  'disconnect',
  'room-error',
  'sync-error',
  'message-handler',
  'join-failed',
  'matchmaking-error',
  'asset-load',
  'audio-load',
  'render-crash',
  'window-error',
  'unhandled-rejection',
]);

/** Clamp a value to a short, loggable string (or undefined). */
function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string' || v.length === 0) return undefined;
  return v.length > max ? `${v.slice(0, max)}…` : v;
}

/** Read only the fields we expect, with conservative length caps. */
function sanitize(body: Record<string, unknown> | null | undefined) {
  const b = body ?? {};
  const kind = typeof b.kind === 'string' && KINDS.has(b.kind) ? b.kind : 'unknown';
  return {
    kind,
    message: str(b.message, 500) ?? '(no message)',
    detail: str(b.detail, 4000),
    code: typeof b.code === 'number' && Number.isFinite(b.code) ? b.code : undefined,
    sessionId: str(b.sessionId, 64),
    room: str(b.room, 64),
    accountId: str(b.accountId, 64),
    username: str(b.username, 64),
    url: str(b.url, 500),
    userAgent: str(b.userAgent, 300),
    clientAt: str(b.at, 40),
  };
}
