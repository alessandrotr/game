import * as Sentry from '@sentry/react';
import { HTTP_BASE } from './auth';

/**
 * Self-hosted client-error reporting — a dependency-free alternative to Sentry.
 * Every report is POSTed to the game server's `/client-error` sink (see
 * telemetryRoutes.ts), which logs it with the originating IP. Wired into the
 * four paths back to the JoinScreen (disconnect, room error, sync error, render
 * crash) plus the global window error handlers, so a rare drop leaves a trail in
 * the server logs instead of a console nobody was watching.
 *
 * Reporting is strictly fire-and-forget and MUST never throw or reject into its
 * callers — a telemetry failure can't be allowed to compound whatever already
 * went wrong.
 */
export type ClientErrorKind =
  | 'disconnect'
  | 'room-error'
  | 'sync-error'
  | 'message-handler'
  | 'join-failed'
  | 'matchmaking-error'
  | 'asset-load'
  | 'audio-load'
  | 'render-crash'
  | 'window-error'
  | 'unhandled-rejection';

// Kinds that Sentry's browser SDK does NOT see on its own — swallowed message
// handlers, clean socket closes, app-level sync/join failures. We forward these
// to Sentry explicitly. The others (render-crash, window-error,
// unhandled-rejection) are already captured by Sentry directly (the
// ErrorBoundary + global handlers), so forwarding them would duplicate events.
// `audio-load` is intentionally excluded: a missing sound effect is cosmetic and
// would just burn the event quota — it still lands in the self-hosted sink.
const SENTRY_FORWARD: ReadonlySet<ClientErrorKind> = new Set([
  'disconnect',
  'room-error',
  'sync-error',
  'message-handler',
  'join-failed',
  'matchmaking-error',
  'asset-load',
]);

export interface ClientErrorReport {
  kind: ClientErrorKind;
  message: string;
  /** Stack trace or React component stack, when available. */
  detail?: string;
  /** WebSocket close code or Colyseus room-error code, when relevant. */
  code?: number;
  /** Colyseus session id, set once we're in a room (see setTelemetrySession). */
  sessionId?: string;
  /** Room name (town/arena/matchmaking), when known. */
  room?: string;
  /** Signed-in account id + display name, when authenticated. */
  accountId?: string;
  username?: string;
}

let sessionId: string | undefined;
let roomName: string | undefined;
let account: { id?: string; username?: string } | undefined;

/** Re-apply the merged Sentry user. Sentry holds a single user object, so the
 *  durable account identity and the per-connection session are combined here:
 *  the account id is the stable key (drives "users affected"), the session id is
 *  the fallback before sign-in and rides along as an extra field. */
function applyUser(): void {
  const id = account?.id ?? sessionId;
  if (!id && !account?.username) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id,
    username: account?.username,
    ip_address: '{{auto}}', // let Sentry record the client IP
    sessionId,
    room: roomName,
  });
}

/** Tag events with the signed-in account (id + display name). Persists across
 *  rooms — call on sign-in/restore, and clear (pass null) on sign-out. */
export function setTelemetryUser(
  user: { accountId?: string | number; username?: string } | null,
): void {
  account = user
    ? {
        id: user.accountId !== undefined ? String(user.accountId) : undefined,
        username: user.username,
      }
    : undefined;
  applyUser();
}

/** Tag subsequent reports with the active session/room (cleared on teardown).
 *  Also attaches the same context to Sentry events (no-op when Sentry is
 *  disabled, e.g. in dev). */
export function setTelemetryContext(ctx: { sessionId?: string; room?: string }): void {
  sessionId = ctx.sessionId;
  roomName = ctx.room;
  applyUser();
  Sentry.setTag('room', ctx.room ?? null);
}

/** Best-effort error normaliser — turns an unknown thrown value into a message
 *  and (when it's an Error) a stack for the `detail` field. */
function describe(reason: unknown): { message: string; detail?: string } {
  if (reason instanceof Error) return { message: reason.message, detail: reason.stack };
  if (typeof reason === 'string') return { message: reason };
  try {
    return { message: JSON.stringify(reason) };
  } catch {
    return { message: String(reason) };
  }
}

/** Fire-and-forget a structured client-error report. Safe to call from any
 *  failure path; never throws. */
export function reportClientError(
  kind: ClientErrorKind,
  info: { message?: string; detail?: string; code?: number; reason?: unknown },
): void {
  try {
    const fromReason = info.reason !== undefined ? describe(info.reason) : undefined;
    const body: ClientErrorReport & { url: string; userAgent: string; at: string } = {
      kind,
      message: info.message ?? fromReason?.message ?? '(no message)',
      detail: info.detail ?? fromReason?.detail,
      code: info.code,
      sessionId,
      room: roomName,
      accountId: account?.id,
      username: account?.username,
      url: location.href,
      userAgent: navigator.userAgent,
      at: new Date().toISOString(),
    };
    // Forward to Sentry the kinds it can't see for itself (no-op when Sentry is
    // disabled). sessionId/room ride along via the scope set in
    // setTelemetryContext. A JS error reason is captured with its stack; an
    // event without one (e.g. a socket close code) goes as a warning message.
    if (SENTRY_FORWARD.has(kind)) {
      Sentry.withScope((scope) => {
        scope.setTag('kind', kind);
        if (info.code !== undefined) scope.setTag('closeCode', String(info.code));
        if (info.reason instanceof Error) Sentry.captureException(info.reason);
        else Sentry.captureMessage(body.message, 'warning');
      });
    }

    const json = JSON.stringify(body);
    // `keepalive` lets the request outlive the teardown/navigation that often
    // follows a disconnect — the equivalent of sendBeacon but with our JSON
    // content type. Errors are swallowed: telemetry must not mask the real bug.
    void fetch(`${HTTP_BASE}/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let reporting throw into a failure path */
  }
}

let globalsInstalled = false;

/** Install one-time global handlers for errors that escape React/Colyseus
 *  (e.g. async callbacks, event listeners, unhandled promise rejections).
 *  Idempotent — safe to call from app bootstrap. */
export function installGlobalErrorReporting(): void {
  if (globalsInstalled) return;
  globalsInstalled = true;
  window.addEventListener('error', (e) => {
    reportClientError('window-error', {
      message: e.message,
      detail: e.error instanceof Error ? e.error.stack : undefined,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    reportClientError('unhandled-rejection', { reason: e.reason });
  });
}
