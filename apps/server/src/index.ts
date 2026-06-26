// Must be first: initialises Sentry before any instrumented library is imported
// (ESM evaluates imports in source order). See instrument.ts.
import './instrument.js';
import * as Sentry from '@sentry/node';
import { createServer } from 'node:http';
import express, { type RequestHandler } from 'express';
import cors from 'cors';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  ARENA_ROOM,
  MATCHMAKING_ROOM,
  TOWN_ROOM,
  ZOMBIE_MATCHMAKING_ROOM,
  ZOMBIE_MODE,
  ZOMBIE_ROOM,
} from '@arena/shared';
import { ArenaRoom } from './rooms/ArenaRoom.js';
import { TownRoom } from './rooms/TownRoom.js';
import { MatchmakingRoom } from './rooms/MatchmakingRoom.js';
import { ZombieMatchmakingRoom } from './rooms/ZombieMatchmakingRoom.js';
import { closeDatabase, initDatabase } from './db/database.js';
import { registerAuthRoutes } from './authRoutes.js';
import { registerPrefsRoutes } from './prefsRoutes.js';
import { registerCosmeticsRoutes } from './cosmeticsRoutes.js';
import { registerPaintRoutes } from './paintRoutes.js';
import { registerTelemetryRoutes } from './telemetryRoutes.js';

// Load apps/server/.env (Node ≥20.12) so local dev can set DATABASE_URL without
// exporting it. No-ops if the file is absent (e.g. in prod, where env vars come
// from the host).
try {
  (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
  /* no .env file — fine */
}

const PORT = Number(process.env.PORT ?? 2567);
const HOST = process.env.HOST ?? '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

// --- Process-level safety nets --------------------------------------------
// Without these, a stray rejected promise or an error thrown in an async
// callback can take the whole server down silently. Log loudly; exit only on a
// truly uncaught exception (state may be corrupt) so the orchestrator restarts
// a clean process.
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled promise rejection:', reason);
  // Colyseus swallows async handler rejections into this event, so capture here
  // or they never reach Sentry.
  Sentry.captureException(reason);
});
process.on('uncaughtException', (err) => {
  console.error('💥  Uncaught exception — exiting for a clean restart:', err);
  // Sentry's default integration already captured `err` synchronously when this
  // event fired; flush it over the network before we exit, or the report dies
  // with the process. Then close the DB and exit for a clean restart.
  void Sentry.flush(2000).finally(() => closeDatabase().finally(() => process.exit(1)));
});

const app = express();

// CORS: lock down to an allowlist in production (comma-separated origins in
// ALLOWED_ORIGINS); reflect any origin when unset, which is fine for local dev.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));
// Character paint PUTs carry base64 PNG overlays (body + head), far larger than
// any other API payload — so /paint gets its own generous JSON limit, registered
// BEFORE the strict global one (body-parser skips once a body is already parsed).
app.use('/paint', express.json({ limit: '4mb' }));
app.use(express.json({ limit: '16kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Public live player count for the login screen's "online" counter. No auth —
// it's a single aggregate number, nothing sensitive. We sum the clients in the
// world rooms (town/arena/zombie) rather than raw CCU: a player holds several
// parallel connections (their world room + matchmaking lobbies), so CCU counted
// each person ~3×. They're in exactly one world room, so this is one-per-player.
const WORLD_ROOMS = new Set<string>([TOWN_ROOM, ARENA_ROOM, ZOMBIE_ROOM]);
app.get('/online', async (_req, res) => {
  try {
    const rooms = await matchMaker.query({});
    const online = rooms.reduce((n, r) => (WORLD_ROOMS.has(r.name) ? n + r.clients : n), 0);
    res.json({ online });
  } catch {
    res.json({ online: 0 });
  }
});

// Email/password account auth (register, login, session check).
registerAuthRoutes(app);
// Per-account UI preferences (camera locks).
registerPrefsRoutes(app);
// Per-account cosmetics (owned items + equipped loadout).
registerCosmeticsRoutes(app);
// Per-account character paint (skin colors + painted overlays) + public reads.
registerPaintRoutes(app);
// Client-error telemetry sink (self-hosted crash reporting → server logs).
registerTelemetryRoutes(app);

// Opt-in Sentry smoke test: GET /debug-sentry throws, which the Sentry Express
// error handler captures. Enabled only when SENTRY_DEBUG=1 so it's never live by
// accident. To verify end to end locally: NODE_ENV=production SENTRY_DEBUG=1
// SENTRY_DSN=… node dist/index.js, then `curl localhost:2567/debug-sentry`.
if (process.env.SENTRY_DEBUG === '1') {
  console.warn('🧪  /debug-sentry route enabled (SENTRY_DEBUG=1)');
  app.get('/debug-sentry', () => {
    throw new Error('debug-sentry: intentional test error');
  });
}

// Colyseus dashboard for inspecting live rooms. It exposes room state and admin
// controls, so it must not be open on the public internet: require basic auth
// when MONITOR_PASSWORD is set, allow it unprotected only in dev, and disable it
// entirely in production when no password is configured.
const monitorPassword = process.env.MONITOR_PASSWORD;
if (monitorPassword) {
  app.use('/monitor', basicAuth('admin', monitorPassword), monitor());
} else if (!IS_PROD) {
  app.use('/monitor', monitor());
} else {
  console.warn('🔒  /monitor disabled in production (set MONITOR_PASSWORD to enable it).');
}

// Sentry's Express error handler — after all routes, before listening. Captures
// errors thrown in route handlers (the HTTP API; the realtime game runs over
// the Colyseus WS transport and is covered by the process-level handlers above).
Sentry.setupExpressErrorHandler(app);

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(TOWN_ROOM, TownRoom);
gameServer.define(ARENA_ROOM, ArenaRoom);
// Zombie survival: the same arena room, under its own handler with the mode
// baked into `onCreate`'s options — so its co-op rooms only match each other.
gameServer.define(ZOMBIE_ROOM, ArenaRoom, { mode: ZOMBIE_MODE });
gameServer.define(MATCHMAKING_ROOM, MatchmakingRoom);
// Co-op zombie squads: a separate singleton lobby registry for ZOMBIE_ROOM runs.
gameServer.define(ZOMBIE_MATCHMAKING_ROOM, ZombieMatchmakingRoom);

// Connect persistence (if configured) before accepting players.
await initDatabase();

// Load the Rapier physics WASM before accepting players — the arena's
// destructible props run a small server-side rigid-body world (see
// DestructibleSystem). One-time init; the engine is shared across rooms.
await RAPIER.init();
console.log('🧊  Rapier physics initialized');

gameServer
  .listen(PORT, HOST)
  .then(() => {
    console.log(`⚔️  Arena server listening on ws://${HOST}:${PORT}`);
    console.log(
      `🌐  CORS: ${allowedOrigins.length ? allowedOrigins.join(', ') : 'all origins (dev)'}`,
    );
    if (monitorPassword || !IS_PROD) {
      console.log(`📊  Monitor available at http://${HOST}:${PORT}/monitor`);
    }
  })
  .catch((err) => {
    console.error('Failed to start arena server:', err);
    process.exit(1);
  });

const shutdown = (signal: string) => {
  console.log(`\n${signal} received — shutting down gracefully...`);
  void closeDatabase();
  gameServer
    .gracefullyShutdown()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

/** Minimal HTTP Basic auth guard (no dependency). Good enough to gate an
 *  internal ops dashboard behind a shared password. */
function basicAuth(user: string, password: string): RequestHandler {
  const expected = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    if (timingSafeEqualStr(header, expected)) {
      next();
      return;
    }
    res
      .set('WWW-Authenticate', 'Basic realm="monitor"')
      .status(401)
      .send('Authentication required');
  };
}

/** Constant-time-ish string comparison (avoids leaking matches via early exit). */
function timingSafeEqualStr(a: string, b: string): boolean {
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
