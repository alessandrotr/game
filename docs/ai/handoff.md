# Handoff — volatile / lower-confidence / tech-debt

Notes that are time-sensitive, only partially verified, or candidate cleanup. **Do not treat
as durable fact** — verify against current code. Promote anything that proves durable into
`CLAUDE.md` / `memory.md`; delete anything that becomes false.

## Lower-confidence / verify-before-relying

- **Exact gameplay numbers** in `docs/ai/domain-rules.md` (horde sizes, HP, XP, gun stats,
  trap thresholds, kill targets) come from a reading of `constants.ts`/`balance.ts` and may
  drift with balance changes. Re-read the source for exact current values.
- **`Player` schema field count** measured at ~44 of Colyseus's 64 cap (one audit pass said
  "50+"). Either way it's approaching the ceiling — count before adding fields.
- **DB column list** (`players`, `class_progress`, `chat_messages`) is summarized from
  `db/*.ts`; confirm exact columns/migrations in `db/database.ts` before schema work.
- **No `render.yaml`/`fly.toml`/`Procfile`** found — the server host (Render per the user) is
  configured in the host's dashboard, not in-repo. The image is built from `apps/server/Dockerfile`.
- **No `.github/workflows/`** — there is no CI in the repo; typecheck/lint/test are run manually.

## Known sharp edges / tech debt

- **Colyseus swallows `onMessage` handler exceptions** — they don't reach Sentry. Only Express
  errors, `uncaughtException`, the now-added `unhandledRejection` capture, and explicit
  `captureServerError`/`captureTickError` call sites report. Most room handlers are unwrapped,
  so handler bugs can fail silently. Candidate: a `BaseGameRoom.onMessage` override that wraps
  every handler in try/catch → `captureServerError` (proposed, not yet implemented).
- **Deploy ordering is manual and easy to get wrong**: a client that sends a new message before
  the server handles it gets disconnected in prod (Colyseus closes the socket). Mitigated by the
  `onMessage('*')` catch-all in `ArenaRoom.onCreate`, but the catch-all/handler must actually be
  deployed. Always deploy server before client for new client→server messages.
- **README.md is stale** ("working starter, not a finished game"). Consider updating or deleting
  to avoid misleading future readers; the code is far ahead of it.
- **Charge replication kill-switch**: at audit time, a client `CHARGE_REPLICATION_ENABLED`
  flag may exist/have existed in `network/colyseus.ts` as a temporary guard during a deploy-skew
  incident. Verify its current state; the durable fix was moving the `SetCharge` handler into
  `ArenaRoom.onCreate` (it had been mis-placed in the gun-mode-only `registerGunHandlers`).
- **`PRODUCTION.md`** references a "Phase 15" hardening pass (CORS allowlist, monitor lockdown,
  graceful shutdown, request-size caps, bundle splitting). Deferred items noted there: structured
  logging (still `console.*`), broader rate limiting (only chat), load testing.
- Server Docker image must copy `packages/shared/node_modules` at runtime (shared depends on
  `zod`, needed by the server at runtime) — don't drop it from the Dockerfile.

## Open questions for deeper investigation later

- Exact tick rate constant and whether all systems honor a single `TICK_MS` (stated ~30Hz / 33ms).
- Bot/zombie pathfinding robustness (stuck detection, separation) under large hordes — perf path.
- Whether any client component still subscribes reactively to per-tick snapshot state (would
  cause re-render churn) — audit `useGameStore` selectors if profiling shows React overhead.
