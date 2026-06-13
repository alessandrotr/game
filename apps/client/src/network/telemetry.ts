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
  | 'render-crash'
  | 'window-error'
  | 'unhandled-rejection';

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
}

let sessionId: string | undefined;
let roomName: string | undefined;

/** Tag subsequent reports with the active session/room (cleared on teardown). */
export function setTelemetryContext(ctx: { sessionId?: string; room?: string }): void {
  sessionId = ctx.sessionId;
  roomName = ctx.room;
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
      url: location.href,
      userAgent: navigator.userAgent,
      at: new Date().toISOString(),
    };
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
