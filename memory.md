# memory.md — Arena tactical cheat sheet

> 30-second refresh before editing. Canonical detail in [`CLAUDE.md`](CLAUDE.md);
> deep dives in [`docs/ai/`](docs/ai/).

## Quick Repo Mental Model

pnpm monorepo, 3 packages:

- **`packages/shared`** (`@arena/shared`) — the **contract**: types, `messages.ts`,
  data registries (abilities/perks/cosmetics/guns/pickables), `constants.ts`, pure helpers.
  No Colyseus dep. Rebuild it for changes to take effect.
- **`apps/server`** — authoritative Colyseus sim. `rooms/ArenaRoom.ts` = the ~30Hz tick
  loop; `rooms/arena/*` = systems wired via `arena/context.ts`. `rooms/schema.ts` = replicated state.
- **`apps/client`** — R3F renderer. Zustand stores (+ non-reactive Maps read in `useFrame`),
  `network/colyseus.ts` (join/sync/senders), `render/` + `scene/` + `shaders/`.

Runtime: client (Vercel) ⇄ WS ⇄ server (Docker) ⇄ Postgres (optional). All 4 game modes
(town/arena/zombie/gun-zombie) are the **same `ArenaRoom`/`AvatarRoom`** classes with mode flags.

## Where To Change Things

| Task | Inspect / edit together |
| ---- | ----------------------- |
| **Ability behavior** | shared `abilities/registry.ts`+`effects.ts` → server `abilities/executor.ts` (`runLeaf`) + `rooms/arena/combat.ts` (`resolveCast`/`dealDamage`) |
| **Ability VFX/anim (client)** | `network/colyseus.ts` `ABILITY_CAST_VFX` + `onAbilityCast`; `render/animation/useWeapon*Animator.ts` / `useBowAnimator.ts`; `render/shaders/{projectiles,bursts}.tsx` + `shaders/index.ts` registry; `assets/data/vfx.ts` |
| **New replicated field** | server `rooms/schema.ts` (append at END) + shared `types.ts` `PlayerView` + client `colyseus.ts` `snapshotState()` |
| **New client→server msg** | shared `messages.ts` (enum+payload) → server handler in `ArenaRoom.onCreate` (NOT `registerGunHandlers`) → client sender in `colyseus.ts`. **Deploy server first.** |
| **Movement / collision** | shared `locomotion.ts` (client predictor + server both use it); server `rooms/util/locomotion.ts`, collision in `rooms/arena/{cover,destructibles,barrels,physics}.ts` |
| **Perks** | shared `perks.ts` + `perk-modifiers.ts` (data + `computePerkModifiers`) → server `rooms/arena/perks.ts` + apply in `combat.ts` |
| **Zombie waves / AI** | server `rooms/arena/zombies.ts` (director) + `bots.ts` (AI) + shared `constants.ts` (scaling) + `roomLayout.ts` (expansion) |
| **Guns (gun mode)** | server `rooms/arena/guns.ts` + `registerGunHandlers()`; client `scene/GunControls.tsx`; shared `constants.ts` GUNS |
| **Weapon/cosmetic** | client `assets/data/weapons.ts` + `assets/CharacterFactory.ts` (skins) + `assets/registry.ts` + `render/enchantMaterial.ts` (enchant shader) + `ui/CustomizePanel.tsx`; shared `cosmetics.ts` (catalog) |
| **Balance/tuning** | shared `balance.ts` (zod-validated fields) + server `rooms/arena/tuning.ts` (per-room copy) |
| **Auth / accounts** | server `auth.ts`, `authRoutes.ts`, `sessions.ts`, `db/players.ts`; client `store/useAuthStore.ts` |
| **Persistence** | server `db/*.ts` (`database.ts` schema/pool, `players`, `cosmetics`, `paint`, `chat`, `prefs`) |
| **Camera/input** | client `scene/CameraRig.tsx`/`CameraControls.tsx`/`MouseMove.tsx`; `hooks/useAbilityHotkeys.ts` |

## Critical Invariants

- **Server authoritative** — clients predict locomotion only; never trust client for combat/damage/projectiles.
- **Schema field order is fixed** — append new replicated fields at the END; `Player` ~44/64 fields.
- **Shared helpers run identically both sides** — `locomotion`, `computePerkModifiers`, `getAbilityConfig`, `levelForXp`. No divergence.
- **Non-reactive snapshots** — read entity state in `useFrame` via `getState()`, never subscribe (re-renders every tick). 100ms interp delay.
- **VFX radius ≤ damage radius** (scale by AoE perk bonus).
- **Unknown Colyseus message ⇒ prod disconnect** — handler must exist server-side first; `onMessage('*')` catch-all is the safety net.
- **Room mode flags:** `zombieMode`/`gunMode`/`coopZombie` set in `ArenaRoom.onCreate`; mode-specific handlers (`registerGunHandlers`) only run for that mode — put cross-mode handlers in `onCreate`.

## Common Workflows

```bash
pnpm install && pnpm dev          # client :5173, server :2567(ws), shared watch
pnpm --filter @arena/server dev   # server only;  pnpm --filter @arena/client dev
pnpm typecheck                    # always run after edits
pnpm --filter @arena/shared build # REQUIRED for shared changes to take effect
pnpm test                         # vitest; single: (cd apps/server && pnpm test -- <path>)
pnpm build                        # shared → server → client (order matters)
docker compose up --build         # full stack + Postgres locally
```

## Debugging Map

- **Ability does nothing / crash on cast** → server handler placement (`onCreate` vs gun-only), cooldown/mana gate in `handleCast`, message registered? client `colyseus.ts` sender.
- **Prod disconnects (1006/1005) on an action** → client sending a message the deployed server doesn't handle (version skew). Check `set_charge`-style errors. Deploy server.
- **Server errors not in Sentry** → Colyseus swallows `onMessage`/handler throws; only Express errors, `uncaughtException`, and `captureServerError`/`captureTickError` call sites reach Sentry. Tick errors are throttled.
- **Desync / rubber-banding** → client vs server `locomotion` divergence, or interp delay; check `snapshotBuffer`/`localPlayer`.
- **Mesh teleporting between players** → un-cloned skinned GLTF (`AssetMesh` must `SkeletonUtils.clone`).
- **Stale behavior after editing shared** → forgot to rebuild `@arena/shared`.
- **Schema decode errors on connected clients** → a replicated field was reordered/inserted mid-list.
- Env touchpoints: server `DATABASE_URL`, `AUTH_SECRET`, `ALLOWED_ORIGINS`, `MONITOR_PASSWORD`, `SENTRY_DSN`; client `VITE_SERVER_URL`, `VITE_SENTRY_DSN`, build-only `SENTRY_AUTH_TOKEN` (never `VITE_`-prefix secrets).

## Editing Heuristics

- Follow the **data-table pattern** — add abilities/perks/cosmetics as data in shared, not bespoke logic.
- Don't duplicate gameplay math — reuse shared helpers so client prediction matches server.
- **Update together:** schema field ⇔ `PlayerView` ⇔ client `snapshotState`; message enum ⇔ server handler ⇔ client sender; ability data ⇔ executor case ⇔ VFX/anim.
- Don't edit generated/build output (`dist/`, `*.tsbuildinfo`) or the cached `dist` shipped to hosts.
- Client `tsconfig` is `noEmit` (Vite compiles) — don't try to make tsc emit.
- Restart the server for schema/handler changes (tsx watch picks up source; HMR is client-only).
- Deploy order for new messages: **server before client**.
