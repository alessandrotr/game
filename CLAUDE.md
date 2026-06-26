# CLAUDE.md — Arena (project guide)

> Canonical, durable understanding of this repo. Keep it high-signal. Tactical
> cheat-sheet lives in [`memory.md`](memory.md); deep reference in
> [`docs/ai/`](docs/ai/); volatile/low-confidence notes in
> [`docs/ai/handoff.md`](docs/ai/handoff.md).

## Project Overview

**Arena** — a browser-based multiplayer arena RPG. Authoritative real-time server
(Colyseus) + React Three Fiber 3D client, pnpm + TypeScript monorepo.

Surfaces / modes:

- **Town** — social hub (chat, cosmetics, no combat), portals into play.
- **Arena** — public FFA + ranked PvP (1v1…5v5, first to 5 kills/team).
- **Zombie survival** — co-op wave defense (abilities) with a **perk** roguelite layer.
- Matchmaking lobbies (PvP ranked + zombie co-op squads), account auth + persistence,
  cosmetics wardrobe + custom paint, leaderboards.

> The root `README.md` is **outdated** ("working starter") — trust the code. This is
> a feature-rich game.

## Tech Stack

| Layer  | Tech |
| ------ | ---- |
| Client | React 18, Vite 5, React Three Fiber + drei, Zustand, `colyseus.js`, Tailwind 4, Radix, Leva (dev), `@sentry/react` |
| Server | Node 20, TypeScript, Colyseus 0.15 (`@colyseus/core`+`schema`+`ws-transport`), Express 4, `@dimforge/rapier3d-compat` (physics), `pg` (Postgres), `@sentry/node` |
| Shared | `@arena/shared` — plain TS types, message contracts, data registries, world constants, `zod`. **No** `@colyseus/schema` dep. |
| Tooling| pnpm workspaces, ESLint 9 (flat), Prettier 3, Vitest, Docker/Compose; Vercel (client) + Docker (server). |

## Repository Map

```
apps/client/   # R3F front end (Vite). src/: network, store, render, scene, hooks, ui, assets, paint, audio, devtools
apps/server/   # Colyseus server (Express + WS). src/: rooms/, rooms/arena/ (systems), db/, abilities/, *Routes.ts
packages/shared/  # @arena/shared — the client/server CONTRACT (types, messages, registries, constants)
docs/          # ANIMATION_PIPELINE, ASSET_PIPELINE, PRODUCTION; docs/ai/ = AI memory
scripts/ tools/   # GLB asset tooling (bounds-glb, merge-clips, Blender arena gen)
```

Where things live (high level — full table in `memory.md`):

- **Contract / data:** `packages/shared/src/` (`messages.ts`, `types.ts`, `abilities/registry.ts`, `cosmetics.ts`, `perks.ts`, `constants.ts`, `classes.ts`, `balance.ts`).
- **Server sim:** `apps/server/src/rooms/ArenaRoom.ts` (tick loop) + `rooms/arena/*` systems, wired via `arena/context.ts`. Schema in `rooms/schema.ts`.
- **Client render/state:** `apps/client/src/store/*` (Zustand + non-reactive stores), `render/` (CharacterModel, animation, shaders), `scene/` (R3F graph), `network/colyseus.ts`.

## Development Workflow

```bash
pnpm install            # corepack enable first; Node 20 (.nvmrc), pnpm 10
pnpm dev                # all packages in parallel (client :5173, server :2567 ws, shared watch)
pnpm --filter @arena/client dev      # client only
pnpm --filter @arena/server dev      # server only (tsx watch)
pnpm build              # STRICT order: shared → server → client
pnpm typecheck          # tsc project refs (shared+server); client tsc --noEmit
pnpm test               # vitest across packages (server has the most)
pnpm lint / pnpm format
```

- Local persistence is **optional**: unset `DATABASE_URL` → server runs in-memory (no saved progression). With Postgres, copy `apps/server/.env.example` → `.env`.
- Client env: copy `apps/client/.env.example` → `.env` (`VITE_SERVER_URL`).
- **Shared changes require a rebuild** to appear in server/client runtime (`pnpm --filter @arena/shared build`, or `pnpm dev` watch).
- Run one test: `cd apps/server && pnpm test -- src/rooms/arena/perks.test.ts`.

## Architecture Rules

- **Server is authoritative.** Clients send *intent* (`MoveTo`, `CastAbility`, …); the
  server simulates on a fixed ~30Hz tick (`TICK_MS ≈ 33.3`). Clients **never** simulate
  combat, projectiles, damage, status, or collision — only **locomotion prediction**.
- **`@arena/shared` is the contract.** It holds plain types + data + pure helpers that
  **both sides call identically** (`computePerkModifiers`, `getAbilityConfig`,
  `levelForXp`, `locomotion.ts` step). Divergence = desync. It has no Colyseus dep so it
  compiles for browser + Node cleanly; the server's decorated `schema.ts` *mirrors* the
  `*View` shapes in `types.ts`.
- **Colyseus schema field order is load-bearing.** Add new replicated `Player`/state
  fields **at the END** (comment: "Kept last so existing replicated field offsets are
  unchanged"). Reordering breaks decode for connected clients. `Player` is ~44 fields —
  Colyseus has a 64-field ceiling; be economical.
- **Adding a client→server message:** register the handler in the room (`onCreate`), add it to
  `ClientMessage` + payload map in shared, and **deploy server before client**. An
  unregistered message **disconnects the client in prod** (Colyseus `client.leave`). An
  `onMessage('*')` catch-all in `ArenaRoom.onCreate` absorbs version skew.
- **Client: no per-frame React churn.** Network snapshots land in **non-reactive** Maps;
  meshes read them imperatively in `useFrame` (`useGameStore.getState().players.get(id)`)
  and interpolate (100ms delay). React only re-renders when the *set* of entities changes.
- **VFX size must match the damage radius** — players read hit area from the visual; never
  exceed it. Scale by perk AoE bonus (`(base+bonus)/base`), folded via the shared helper.

## Code Conventions

- **Data-driven registries.** Abilities, perks, cosmetics, pickables, destructibles
  are `Record`-keyed data tables in shared; logic reads them. Tooltips auto-generate from
  effect data (`abilities/describe.ts`) to avoid drift.
- **IDs are `category.name`** (`char.warrior`, `weapon.sword`, `vfx.fireball`); ability/
  perk/cosmetic ids are snake_case; ability slots are UPPERCASE `Q/W/E/R`.
- **Shared is logic-free data + pure helpers**; mechanics live server-side; client uses the
  same helpers only for prediction/UI estimates.
- **Effects are composable** (`projectile`/`aoe`/`dash`/`heal_allies` + leaf
  damage/heal/shield/knockback/status); the server `abilities/executor.ts` runs them via
  `CombatSystem` (`EffectRuntime`).
- TS strict everywhere (`noUncheckedIndexedAccess`, `noUnusedLocals/Params`, `noImplicitOverride`);
  unused vars allowed only with `_` prefix; type-only imports enforced. Prettier: 100 col,
  single quotes, trailing commas.
- Dev-only server messages are `NODE_ENV`-gated no-ops in prod.

## Business / Domain Logic (summary — full detail in `docs/ai/domain-rules.md`)

- **4 classes** (warrior/mage/archer/priest), each fixed `Q/W/E/R` (see `CLASS_LOADOUTS`).
  Per-class base stats in `classes.ts`; live-tunable fields validated by `balance.ts` (zod).
- **Progression:** closed-form XP curve (`xpForLevel`/`levelForXp`), per-class, persisted.
  Cosmetics unlock by `requiredLevel`/rarity.
- **Cosmetics:** skin/dye/pedestal/title/rim/weapon/enchant, per class; enchant = animated
  weapon shader. Custom **paint** is stored over HTTP (too big for schema) and referenced by
  a short `paintRev`; peers refetch on change.
- **Zombie survival:** horde + HP scale with level; perk roguelite (3 slots, offered on wave
  clears; 33 perks / 11 chains; `computePerkModifiers` folds them). Traps + room-expansion.
- **Matchmaking:** ranked 1v1–5v5 (`MatchmakingRoom`) and zombie co-op squads
  (`ZombieMatchmakingRoom`) reserve seats, then drop into an `ArenaRoom`.

## Integrations

- **Persistence:** Postgres via `pg` (`db/database.ts`). Tables: `players` (account/guest,
  cosmetics, paint), `class_progress` (xp/level/kills/…), `chat_messages`. Optional locally.
- **Auth:** HMAC-signed tokens (`auth.ts`, `AUTH_SECRET`); guest → registered upgrade in
  place; single-session-per-account enforced (`sessions.ts`, "newest tab wins").
- **Error tracking:** Sentry on both sides (`instrument.ts` server, `@sentry/react` client).
  Client errors also POST to the server (`telemetryRoutes.ts`).
- **HTTP API (Express):** `/health`, `/online`, `/monitor` (Colyseus dash, password-gated in
  prod), auth/cosmetics/paint/prefs/telemetry routes. WS handles realtime rooms.
- **Deploy:** client → **Vercel** (`vercel.json`); server → **Docker** image (Render/etc.).

## Known Pitfalls / Gotchas

- **Deploy/version skew:** a new client message with an old server = prod disconnects.
  Deploy server first; rely on the `onMessage('*')` catch-all.
- **Colyseus swallows `onMessage` handler throws** (they don't reach Sentry's process
  handlers) — wrap risky handlers or they fail silently. Tick errors are caught + throttled
  (`captureTickError`); a thrown tick freezes the world but keeps the room alive.
- **Schema field-order** and the **64-field cap** (see Architecture Rules).
- **Shared not rebuilt** → server/client run stale types/data (common confusion).
- **Skinned GLTFs must be cloned per instance** (`SkeletonUtils.clone`) or meshes teleport.
- **Tick-loop order matters** in `ArenaRoom.update()` (AI → movement → collision → systems);
  most server bugs are ordering/race issues or schema-order issues.

## Safe Change Playbook

- **Ability / combat:** shared `abilities/{registry,effects}.ts` → server `abilities/executor.ts`
  + `rooms/arena/combat.ts` (+ `projectiles.ts`) → client `colyseus.ts` `ABILITY_CAST_VFX`,
  animators, shaders. Run server vitest (`combat`, `executor`, `status`, `perk-effects`).
- **New replicated field:** append to `schema.ts` **and** `PlayerView` in shared, map it in
  client `colyseus.ts` `snapshotState`. Never reorder.
- **New client→server message:** shared `messages.ts` → server handler in `onCreate` → client
  sender. Deploy server first.
- **Movement:** `packages/shared/src/locomotion.ts` is shared by client predictor + server —
  keep both in lockstep.
- **Perks:** shared `perks.ts` + `perk-modifiers.ts` (data + fold) → server `rooms/arena/perks.ts`
  / `combat.ts` apply. Test in FFA arena via DevTools "Perks (debug)".
- **Cosmetic/weapon/VFX:** client `assets/data/*` + `assets/registry.ts` + shaders + UI; see
  the where-to-change tables in `memory.md`.
- After any change: `pnpm typecheck`. For shared changes: rebuild shared. For schema/handler
  changes: restart the server (HMR won't pick them up).
