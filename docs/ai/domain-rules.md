# Domain / business rules (deep reference)

Game/business logic that isn't obvious from code structure. Source of truth is the code in
`packages/shared/src/` — treat specific numbers here as orientation and **verify in
`constants.ts` / `balance.ts` / `abilities/registry.ts` before relying on exact values**.

## Classes & abilities

4 playable classes; each has a fixed `Q/W/E/R` (`CLASS_LOADOUTS` in `abilities/registry.ts`):

| Class | Q | W | E | R |
| ----- | - | - | - | - |
| warrior | cleave | charge | shield_wall | ground_slam |
| mage | fireball | frost_nova | arcane_bolt | arcane_blast |
| archer | power_shot | crippling_shot | tumble | pinning_arrow |
| priest | smite | heal (Sanctuary) | renew (Blessing) | condemn (Judgment) |

- **Aim types** (`abilities/effects.ts`): `'self'` (instant, no aim), `'direction'` (skillshot
  along cursor), `'point'` (ground-targeted), `'unit'` (locked target; framework exists, unused).
- **Hold-to-aim** = `direction`/`point` non-channel abilities: key-down begins aiming, key-up
  fires. These can show a **charge/wind-up** pose, replicated so others see it
  (`chargeAbility`/`chargeDir` schema + `SetCharge` msg). Excluded from wind-up by design:
  warrior `charge`, archer `tumble` (fire-only animations); off in gun mode.
- **Channels** (priest `condemn`): no `effects`; use `channelMs`/`channelTickMs`/`beamWidth`;
  the server runs a sustained beam, re-aimed via `AimChannel`.
- **`castTimeMs`** is display + server gating only (the client does not predict cast time).
- **Effects are composable**: `projectile` / `aoe` (with `arc` for cones) / `heal_allies` /
  `dash` + leaf `damage`/`heal`/`shield`/`knockback`/`status`. Per-class rebalance via
  `CLASS_ABILITY_OVERRIDES` (empty by default); `getAbilityConfig(class, ability)` folds base+override.
- **Tooltips auto-generate** from effects (`abilities/describe.ts`) — don't hand-write descriptions.
- `smash` exists but is unused (reserved).

## Status effects

~14 kinds (`abilities/effects.ts` + `status.ts` helpers): hard CC `stun`/`root`/`silence`;
soft `slow`/`haste`/`attack_speed`/`damage_amp`; `empower` (flat bonus to next hit, consumable,
can be ability-locked); `field` (damaging aura while carrier alive); `dot`/`hot`/`poison`;
`shield` (absorb pool); `buff` (special). **`magnitude` means different things per kind**
(multiplier for slow/haste/attack_speed/damage_amp; flat for shield/empower; radius for field;
tick amount for dot/hot) — a mismatch there is a balance bug, not a sync bug.

## Progression

- Closed-form XP curve (`xpForLevel`/`levelForXp` in `constants.ts`) — used by both server
  (persistence) and client (HUD), so they always agree. XP from PvP kills and zombie kills
  (scaled by zombie variant; miniboss splits to the squad). Persisted per class in `class_progress`.

## Cosmetics & paint (`cosmetics.ts`)

- Types: **skin** (class-bound look), **dye** (tint), **pedestal** (avatar ring), **title**
  (nameplate), **rim** (2D avatar frame), **weapon** (held asset), **enchant** (animated weapon
  shader). Rarity common/rare/epic/legendary; unlock by `requiredLevel`.
- Per-class wardrobe: owned set + equipped loadout, persisted (`cosmetics_owned`,
  `cosmetics_loadout`), broadcast live on `EquipLoadout`.
- **Custom paint** is per-account/per-class PNG overlays — too large for schema, stored over
  HTTP (`/paint`) and referenced by a short `paintRev` string; peers refetch when it changes.
  Weapons have NO baked color by default — color comes from the enchant and reflects on abilities.

## Zombie survival

- Horde count, concurrent-alive cap, and zombie HP all scale with level (formulas in
  `constants.ts`: `zombieHordeSize`/`zombieMaxAlive`/`zombieHealthForLevel`).
- Variants: normal, sprinter (faster, less HP), fat (tanky, slow), miniboss (drops a heal).
  Zombies are **bots** (in the room's `bots` map), not players; procedural placeholder bodies.
- **Perks** (`perks.ts` + `perk-modifiers.ts`): 3 slots, offered after wave milestones
  (common → rare upgrades → legendary). 33 perks across 11 upgrade chains. Auto-pick if AFK.
  Each perk is **data** (`modifiers` deltas); `computePerkModifiers(perkIds)` folds them with
  per-field combine rules (mult/add/or/set). Mechanics are applied **server-side**; the client
  uses the same fold only for optimistic cooldown/mana/AoE estimates. `INTERNAL_PERK_DAMAGE`
  marks server-applied passives so the client doesn't double-apply.
- **Traps** (zombie mode): heal / death(fire) / singularity / buff-core — charge from nearby
  zombie kills, then fire an area effect; on cooldown after.
- **Room expansion** (`roomLayout.ts`): linear sections unlocked by clearing waves (doors open).
- **Co-op** (`coopZombie`): death is final; squad wipe → game over.

## Gun-mode zombie

Abilities disabled (the kit is gated off in `handleCast`); fight with guns (`guns.ts`,
`constants.ts` GUNS): pistol (slot 3) + machine gun (slot 4), magazine/fire-rate/reload/reserve.
Twin-stick: WASD move + mouse aim; move speed differs FPS vs top-down (`SetGunView` keeps client
+ server in sync).

## PvP / matchmaking

- Ranked modes 1v1…5v5 (team size × 2 = players); first to ~5 kills per team wins.
  `MatchmakingRoom` runs lobbies + a ready-check; on accept, seats are reserved in an `ArenaRoom`.
- Zombie co-op: `ZombieMatchmakingRoom` — public (browser) or private (4-char share code, no
  ambiguous chars); host launches a 1–N squad into a `ZOMBIE_ROOM`.

## World props

- **Cover structures** (trailers/cars/dumpsters): HP scaled by volume (`structureHp`), block
  movement/projectiles, crumble at 0 HP (circle removed from collision). Trailers use capsule
  (multi-circle) colliders. Doors in zombie mode are indestructible gates.
- **Destructibles** (oil drums/tires): Rapier physics, non-explosive, pushable; drums drop
  pickables on destroy.
- **Burning barrels**: destructible + explode mechanic (separate from the Rapier destructibles).
- **Pickables** (`pickables.ts`): molotov (burst + lingering puddle), grenade (bigger burst, no
  puddle), heal pack (miniboss drop). Grab/throw via interact; thrown pickables travel as
  projectiles and burst on impact (ground zones are separate lingering entities).
- **Auto-attacks** (`constants.ts`): per class, melee or ranged, with range/damage/cooldown;
  toggled by `SetAutoAttack` (zombie mode forces abilities-only for players).

## Persistence model (`apps/server/src/db`)

Postgres (optional locally). Tables (created idempotently in `database.ts`):

- `players` — account or guest; email/username/password_hash, `is_guest`/`guest_id`,
  `camera_prefs`, `cosmetics_owned`, `cosmetics_loadout`, `cosmetics_paint`, timestamps.
- `class_progress` — per (player, class): xp, level, kills, deaths, wins, losses. Loaded on
  arena join, accumulated in a `MatchProfile`, flushed on leave.
- `chat_messages` — channel + sender + body (town chat persisted/trimmed).

Guest flow: first login → guest token; first match → `players` row (is_guest); register later
→ upgrade row in place. Tokens are HMAC-signed (`auth.ts`, 30-day expiry) carrying account id +
name, so rooms need no DB hit to identify a player.
