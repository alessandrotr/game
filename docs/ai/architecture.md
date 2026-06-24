# Architecture (deep reference)

Detailed runtime model for the Arena monorepo. See [`../../CLAUDE.md`](../../CLAUDE.md)
for the high-level guide and [`../../memory.md`](../../memory.md) for the cheat sheet.

## Runtime topology

```
Browser (React/R3F)  ──WS──▶  Colyseus server (Node)  ──▶  Postgres (optional)
   colyseus.js                Express HTTP API + WS         pg pool
   Zustand store              ArenaRoom tick (~30Hz)        players / class_progress / chat_messages
```

- **Client** deploys to Vercel (static SPA, `apps/client/dist`). **Server** deploys as a
  Docker image (`apps/server/Dockerfile`, Node 20 Alpine, non-root). Local full stack via
  `docker-compose.yml` (Postgres 16 + server + nginx client).
- Server bootstrap (`apps/server/src/index.ts`): Sentry (`instrument.ts`, imported FIRST) →
  DB init → Rapier WASM init → Express routes → `gameServer.define(...)` rooms → listen on
  `PORT` (default 2567). Process safety nets: `unhandledRejection` (now captured to Sentry),
  `uncaughtException` (capture → flush → exit for clean restart).
- HTTP: `/health`, `/online` (live player count across world rooms), `/monitor` (Colyseus
  dashboard; password-gated/disabled in prod), and auth/cosmetics/paint/prefs/telemetry routes.

## Room hierarchy

```
Colyseus Room
└── BaseGameRoom<TState>           # single-session enforcement, duplicate eviction, onLeave→removeClient
    ├── AvatarRoom<ArenaState>     # shared locomotion + appearance + chat/emote/equip handlers
    │   ├── ArenaRoom              # the full combat simulation (also zombie + gun via flags)
    │   └── TownRoom               # non-combat hub (chat persisted)
    ├── MatchmakingRoom            # ranked PvP lobbies (1v1…5v5), ready-check, seat reservation
    └── ZombieMatchmakingRoom      # co-op zombie squad finder (public/private + share code)
```

`gameServer.define` mapping (`index.ts`):

- `ARENA_ROOM → ArenaRoom`
- `ZOMBIE_ROOM → ArenaRoom { mode: ZOMBIE_MODE }`
- `GUN_ZOMBIE_ROOM → ArenaRoom { mode: ZOMBIE_MODE, gun: true }`
- `TOWN_ROOM → TownRoom`, `MATCHMAKING_ROOM → MatchmakingRoom`, `ZOMBIE_MATCHMAKING_ROOM → ZombieMatchmakingRoom`

**Mode flags** are set in `ArenaRoom.onCreate(options)`: `zombieMode = mode===ZOMBIE_MODE`,
`coopZombie = zombieMode && options.coop`, `gunMode = zombieMode && options.gun`. Arena bounds,
respawn, perks, and which systems run all branch on these.

### Message handler registration (important)

Handlers register in `onCreate` (runs for **every** mode). Mode-specific handlers are gated:
`if (this.gunMode) this.registerGunHandlers()`. **A handler placed inside `registerGunHandlers`
only exists in gun mode** — putting a generally-needed handler there means it silently never
registers in normal/zombie play (this was a real prod bug with `set_charge`). Cross-mode
handlers (movement, cast, charge, the `onMessage('*')` catch-all) belong directly in `onCreate`.

## The tick loop (`ArenaRoom.update(dt)`, ~33ms)

Order matters — most server bugs are ordering/race issues. Roughly:

1. Pre-player: zombie director (spawn/advance waves), perk auto-pick (AFK), chest spawn timer.
2. AI intent: bots/zombies write to shared `destinations`/`attackTargets` maps.
3. Build collision sets: live zombies as blockers + prop obstacles.
4. Per-player sim: death/respawn, mana regen + status tick (CC/buff/DoT/HoT), aura damage,
   wind-up (rooted cast) resolution, movement (displacement → locomotion or rooted), collision
   resolve, room-expansion clamp, gravity/jump, animation state.
5. Zombie separation (repel overlaps).
6. Channel processing (beam damage ticks).
7. Combat systems in order: projectiles → gun reload → cover move → Rapier physics step →
   barrels read-back → destructibles read-back → pickables/ground-zones → traps.
8. Co-op game-over check; increment tick.

Errors in the tick are caught and throttled via `captureTickError` (a thrown tick freezes the
world in place but keeps the room/process alive — it does **not** disconnect).

## ArenaContext + systems wiring

`rooms/arena/context.ts` defines `ArenaContext` — the seam between `ArenaRoom` and its systems.
It exposes `state`, `tuning`, `obstacles`, `now()`, `broadcast`/`send`, scheduling, the shared
mutable maps (`destinations`, `displacements`, `attackTargets`, `respawnAt`, `animOneShots`),
and queries (`perkModifiers`, `recordKill`, `resetCooldowns`). Systems read/write the shared
maps **by reference** — no message passing between systems.

Systems (`rooms/arena/*`), built in `buildSystems()`:

- **`CombatSystem` (combat.ts)** — damage/heal/shield, status apply+tick, ability resolution
  (`resolveCast` → ability `executor`), auto-attacks, dash-impact deferral. Implements
  `EffectRuntime` (what the ability executor calls back into). **Central to any combat change.**
- **`ProjectileSystem` (projectiles.ts)** — ability + auto-attack projectiles, movement, hit
  detection, pierce/burst; runs on-hit effects via the executor.
- **`BarrelSystem` / `DestructibleSystem` / `CoverSystem`** — Rapier-physics props (barrels,
  drums/tires, trailers/cars/dumpsters + doors); HP, crumble, read-back of physics transforms,
  loot drops. Physics world owned by **`ArenaPhysics` (physics.ts)** (`step()` each tick).
- **`GroundZoneSystem`** (puddles), **`PickableSystem`** (molotov/grenade/heal-pack grab/throw),
  **`TrapSystem`** (zombie traps), **`GunSystem` (guns.ts)** (magazines/reload/fire).
- **`PerkSystem` (perks.ts)** — zombie perk progression (offer/pick/auto-pick); `getModifiers`.
- **`BotDirector` (bots.ts)** — practice bots + zombie AI. **`ZombieDirector` (zombies.ts)** —
  wave scheduling. **`ArenaMatch` (match.ts)** — ranked outcome/scoreboard.

Ability execution flow: client `CastAbility` → `ArenaRoom.handleCast` (gates: alive, not
stunned/silenced, cooldown, mana; wind-up if `castTimeMs`) → `CombatSystem.resolveCast` →
`abilities/executor.ts` walks the effect tree → calls back `EffectRuntime` (deal damage, apply
status, spawn projectile, …). Channels (e.g. priest condemn) tick over `channelMs` via the
room's `channels` map.

## Client architecture

### Entry & shell

`src/main.tsx` (Sentry + asset registration + mount) → `src/App.tsx` (auth restore, world
transitions town↔arena, error boundary). No router — a status machine renders
`AuthScreen` → `JoinScreen` → `GameScene + Hud`. Scene mounts `CameraRig`, `CameraControls`,
`MouseMove` (point-to-move + ground-target cursor), `GunControls` (gun mode). `VITE_ENTRY` can
select alternate demo entry points.

### State: reactive vs non-reactive (the core perf pattern)

- **Reactive Zustand stores** drive React renders. `useGameStore` holds room type, the **id
  lists** (players/projectiles/barrels…) that trigger mounts/unmounts, server tick, seeds,
  zombie flags. Others: `useAuthStore`, `useConnectionStore`, `useCosmeticsStore`,
  `usePaintStore`, `useCameraPrefsStore`, `useChatStore`, `useLobbyStore`,
  `useZombieLobbyStore`, `useCoopStore`, `useMatchResultStore`, `useLeaderboardStore`,
  `useEffectsStore` (VFX list), `usePerkStore`, `useQualityStore`, `useHudStore`, etc.
- **Non-reactive stores** are read imperatively in `useFrame` (no re-render):
  `snapshotBuffer` (per-entity transform history; `sampleTransform(now - 100ms)` for smooth
  remotes), `localPlayer` (predicted local transform), `castAim` (cast seq+yaw+hold; weapon
  animators watch the seq), `weaponTip` (orb world pos for spell VFX origin),
  `abilityCooldowns` (optimistic mirror), `animationEvents`, `floatingText`, `destinationState`,
  `abilityTargeting`, `dashState`, `cursorState`, `fpsAim`.

**Rule:** never `useStore(s => s.players)` in a component (re-renders every patch). Read
`useGameStore.getState().players.get(id)` inside `useFrame`. React re-renders only when the
id *set* changes (mount/unmount).

### Networking (`network/colyseus.ts`)

`joinGame(...)` → `client.joinOrCreate(room, options)`; `wireRoom` attaches `onStateChange`
(→ `snapshotState()` repackages live schema into plain Maps → `applySnapshot` updates ids +
non-reactive snapshots) and message handlers. A watchdog flags a stalled connection if no
patch arrives. Prediction: local transform sent as intent + rendered from prediction; ability
cooldowns started optimistically (server `ResetCooldown` corrects); dash predicted locally.
`ABILITY_CAST_VFX` maps each ability → which burst to spawn, where, and orientation;
`onAbilityCast` spawns VFX + animation events and tints by weapon enchant. `TAB_SESSION` UUID
enforces one session per account.

### Rendering / animation / VFX

- **`CharacterModel.tsx`** assembles body (placeholder primitives or GLTF via `AssetMesh`) +
  weapon. `WeaponMount` dispatches `CasterWeaponMount` / `MeleeWeaponMount` / `BowWeaponMount`.
  Two animation backends behind one interface: `useGltfAnimator` (crossfade clips) and
  `useProceduralAnimator` (skeleton-less placeholder); `animationStateMachine.ts` maps logical
  states → clips/poses.
- **Weapon animators** (`render/animation/`): `useWeaponCastAnimator` (caster thrust + orb
  flare, watches `castAim.seq`), `useWeaponSwingAnimator` (melee), `useBowAnimator` (draw/loose,
  nocked arrows). `localAim.ts` resolves the aim direction (local from cursor, remote from
  replicated charge state).
- **Enchant shaders** (`render/enchantMaterial.ts`): `onBeforeCompile` injection + a shared
  `enchantTime` uniform; materials cached by `effect|color|color2` (cheap regardless of count).
- **VFX** (`render/shaders/`): `PROJECTILE_SHADERS` + `BURST_SHADERS` registries in
  `shaders/index.ts`; each is a single additive quad with a procedural frag driven by
  `uProgress` (`useBurstClock`). `VfxLayer` + `EffectAnchor` spawn/track effects (capped by
  quality tier; follow entities use the same predicted/interpolated transform as players).
- **Quality tiers** (`useQualityStore`): dpr/shadows/effect-cap; zombies render shadowless +
  frustum-culled; barrel light roster is fixed to keep the shadow pass constant.
