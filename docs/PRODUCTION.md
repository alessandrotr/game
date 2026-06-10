# Production Readiness (Phase 15)

The review pass that hardens the server and client for public deployment. This
documents the configuration surface, what was hardened, and what is deliberately
deferred.

## Environment variables

### Server (`apps/server`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `2567` | Listen port. |
| `HOST` | no | `0.0.0.0` | Bind address. |
| `NODE_ENV` | prod | — | `production` enables prod-only behavior (monitor lockdown). |
| `DATABASE_URL` | no | — | Postgres connection string. Unset ⇒ persistence disabled (in-memory only), server still runs. |
| `PGSSL` | no | — | `disable` for local Postgres; managed DBs use SSL (the default). |
| `ALLOWED_ORIGINS` | prod | — | Comma-separated CORS allowlist. Unset ⇒ all origins reflected (dev only). |
| `MONITOR_PASSWORD` | prod | — | Password (user `admin`) for `/monitor`. In production the dashboard is **disabled** unless this is set. |
| `AUTH_SECRET` | prod | random | HMAC key for signing account session tokens. **Set in production** (≥16 chars) or every restart logs all players out. |

### Client (`apps/client`, baked in at build time)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SERVER_URL` | `ws://localhost:2567` | Game server WebSocket URL. |
| `VITE_ENTRY` | `game` | `game` ships the arena; `physics`/`powered` load dev demos (lazy chunk). |

## What was hardened

- **Process safety nets** — `unhandledRejection` is logged (no silent death);
  `uncaughtException` is logged and the process exits so the orchestrator
  restarts a clean one. DB pool is closed on the way out.
- **CORS allowlist** — `ALLOWED_ORIGINS` restricts the HTTP endpoints in
  production; permissive only when unset (dev).
- **Monitor lockdown** — `/monitor` exposes live room state/admin controls, so
  it requires HTTP Basic auth (`MONITOR_PASSWORD`) and is disabled entirely in
  production when no password is set.
- **Chat rate limiting** — a sliding-window limit (`CHAT_RATE_MAX` per
  `CHAT_RATE_WINDOW_MS`) per sender, on top of the existing sanitization and
  length cap. Per-sender state is cleared on leave.
- **Request size cap** — JSON bodies limited to 16 kB.
- **Bundle split** — the physics-engine dev demos are dynamically imported, so
  the shipped game bundle dropped ~2 MB (3.4 MB → 1.4 MB, gzip 1.17 MB → 0.40 MB).
- **Graceful shutdown** — `SIGINT`/`SIGTERM` drain rooms via
  `gracefullyShutdown()` and close the DB pool.
- **Health check** — `GET /health` returns status + uptime (for platform probes).
- **Container** — runs as the non-root `node` user; production image carries
  prod dependencies only.

## Deferred (future work)

- **Error tracking / metrics** — no Sentry/PostHog yet. Hook into the process
  handlers and room lifecycle when added.
- **Structured logging** — currently `console.*`; a JSON logger (pino) would
  improve prod log ingestion.
- **Broader rate limiting** — only chat is limited; movement/cast spam relies on
  server-side cooldowns and clamping. Add per-client message budgets if abused.
- **Load testing** — no automated soak/load test for room capacity.
