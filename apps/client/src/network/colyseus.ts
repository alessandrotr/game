import { Client, type Room } from 'colyseus.js';
import {
  ABILITIES,
  ARENA_ROOM,
  MATCHMAKING_ROOM,
  SESSION_SUPERSEDED_CODE,
  TOWN_ROOM,
  ZOMBIE_MATCHMAKING_ROOM,
  ZOMBIE_ROOM,
  ClientMessage,
  ServerMessage,
  type AbilityKind,
  type BarrelView,
  type CharacterClass,
  type CoverStructureView,
  type DestructibleView,
  type GroundZoneView,
  type PickableView,
  type TrapView,
  type ClientMessagePayloads,
  type LeaderboardCategory,
  type LobbyMode,
  type QueueMemberView,
  type PlayerView,
  type ProjectileView,
  type ServerMessagePayloads,
  type VfxAssetId,
  type ZombieLobbyView,
  computePerkModifiers,
  isPerkId,
  isZombieSkin,
} from '@arena/shared';
import { useGameStore, type RoomType } from '../store/useGameStore';
import { useChatStore } from '../store/useChatStore';
import { useSpeechStore } from '../store/useSpeechStore';
import { useQueueStore } from '../store/useQueueStore';
import { useInviteStore } from '../store/useInviteStore';
import { useZombieLobbyStore } from '../store/useZombieLobbyStore';
import { useCoopStore } from '../store/useCoopStore';
import { useMatchResultStore } from '../store/useMatchResultStore';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { useLevelUpStore } from '../store/useLevelUpStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCosmeticsStore, type Appearance } from '../store/useCosmeticsStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { usePaintStore } from '../store/usePaintStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { usePerkStore } from '../store/usePerkStore';
import { pushAnimationEvent } from '../render/animation/animationEvents';
import { setCastAim } from '../store/castAim';
import { abilityTintColor } from '../assets/CharacterFactory';
import { resetCooldowns } from '../store/abilityCooldowns';
import { clearFloatingText, spawnFloatingText } from '../store/floatingText';
import { clearSnapshots, recordSnapshots } from '../store/snapshotBuffer';
import { clearDestination } from '../store/destinationState';
import { preloadZombieModels } from '../assets/preload';
import { reportClientError, setTelemetryContext } from './telemetry';

/** Colyseus handler name for each world. */
const ROOM_HANDLER: Record<RoomType, string> = { town: TOWN_ROOM, arena: ARENA_ROOM };

/** World height above a player's feet where combat numbers appear. */
const COMBAT_TEXT_Y = 2.1;
const DAMAGE_COLOR = '#ff5a5a';
const HEAL_COLOR = '#7cff9e';
const LEVELUP_TEXT_Y = 2.7;
const LEVELUP_COLOR = '#ffd761';

/**
 * Structural view of the runtime Colyseus state. colyseus.js reflects the
 * server schema at runtime, so we read it through these minimal shapes rather
 * than depending on the server's decorated schema classes.
 */
type RawPlayer = PlayerView;
type RawProjectile = ProjectileView;
interface RawBarrel {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  alive: boolean;
}
type RawDestructible = DestructibleView;
type RawStructure = CoverStructureView;
type RawPickable = PickableView;
type RawGroundZone = GroundZoneView;
type RawTrap = TrapView;
interface RawState {
  players: { forEach(cb: (player: RawPlayer, key: string) => void): void };
  projectiles: { forEach(cb: (projectile: RawProjectile, key: string) => void): void };
  /** Arena rooms only — interactive barrels (absent in town). */
  barrels?: { forEach(cb: (barrel: RawBarrel, key: string) => void): void };
  /** Arena rooms only — destructible objects (absent in town). */
  destructibles?: { forEach(cb: (d: RawDestructible, key: string) => void): void };
  /** Arena rooms only — HP-bearing cover structures (absent in town). */
  structures?: { forEach(cb: (s: RawStructure, key: string) => void): void };
  /** Arena rooms only — loose pickable objects (absent in town). */
  pickables?: { forEach(cb: (p: RawPickable, key: string) => void): void };
  /** Arena rooms only — lingering ground zones, e.g. the molotov puddle. */
  groundZones?: { forEach(cb: (z: RawGroundZone, key: string) => void): void };
  /** Zombie mode only — trap zones (heal / death). */
  traps?: { forEach(cb: (t: RawTrap, key: string) => void): void };
  tick: number;
  /** Arena rooms only — per-match procedural layout seed (absent in town). */
  layoutSeed?: number;
  /** Zombie survival mode flag + wave counters (arena rooms only). */
  zombieMode?: boolean;
  /** Co-op matchmade zombie run (death is final). */
  coopZombie?: boolean;
  zombieLevel?: number;
  zombiesRemaining?: number;
  zombiesAlive?: number;
  unlockedSections?: number;
  /** Resonance of the Void: lit altar gem sockets (0–4). */
  altarGemsLit?: number;
}

// Strip any trailing slash so the Colyseus client builds clean URLs even if
// VITE_SERVER_URL is configured with one.
const ENDPOINT = (import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567').replace(/\/+$/, '');

let client: Client | null = null;
let room: Room | null = null;
/** `performance.now()` of the last applied state patch — the connection watchdog
 *  reads this to detect a silent stall (state stops arriving while still joined). */
let lastPatchAt = 0;

/** Milliseconds since the last state patch was applied (Infinity if never). */
export function timeSinceLastPatch(): number {
  return lastPatchAt === 0 ? Infinity : performance.now() - lastPatchAt;
}

/** A per-tab session key (stable for this page load, unique per tab). Sent with
 *  every join so the server can enforce one play session per account — a newer
 *  tab supersedes an older one ("newest wins"). */
const TAB_SESSION =
  globalThis.crypto?.randomUUID?.() ?? `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;

function snapshotState(state: RawState): {
  players: Map<string, PlayerView>;
  projectiles: Map<string, ProjectileView>;
  barrels: Map<string, BarrelView>;
  destructibles: Map<string, DestructibleView>;
  structures: Map<string, CoverStructureView>;
  pickables: Map<string, PickableView>;
  groundZones: Map<string, GroundZoneView>;
  traps: Map<string, TrapView>;
} {
  const players = new Map<string, PlayerView>();
  state.players.forEach((player, sessionId) => {
    players.set(sessionId, {
      sessionId,
      name: player.name,
      x: player.x,
      y: player.y,
      z: player.z,
      rotation: player.rotation,
      hp: player.hp,
      maxHp: player.maxHp,
      mana: player.mana,
      maxMana: player.maxMana,
      // Tolerate a server that predates the status/shield/team fields (deploy or
      // build skew): a missing field arrives as undefined, so default it rather
      // than throw inside the state-patch handler (which kills the whole loop).
      shield: player.shield ?? 0,
      alive: player.alive,
      characterClass: player.characterClass,
      skinId: player.skinId,
      dyeId: player.dyeId ?? '',
      pedestalId: player.pedestalId ?? '',
      titleId: player.titleId ?? '',
      rimId: player.rimId ?? 'rim.standard',
      weaponId: player.weaponId ?? '',
      enchantId: player.enchantId ?? '',
      pid: player.pid ?? 0,
      paintRev: player.paintRev ?? '',
      animState: player.animState,
      attackTargetId: player.attackTargetId,
      level: player.level,
      xp: player.xp,
      kills: player.kills,
      deaths: player.deaths,
      team: player.team ?? 'blue',
      // Copy into a plain array (decouple from the live ArraySchema).
      statuses: (player.statuses ?? []).map((s) => ({
        kind: s.kind,
        expiresAt: s.expiresAt,
        magnitude: s.magnitude,
        nextTickAt: s.nextTickAt,
        sourceId: s.sourceId,
      })),
      channelAbility: player.channelAbility ?? '',
      channelDirX: player.channelDirX ?? 0,
      channelDirZ: player.channelDirZ ?? 1,
      holding: player.holding ?? '',
      perk1: player.perk1 ?? '',
      perk2: player.perk2 ?? '',
      perk3: player.perk3 ?? '',
      chargeAbility: player.chargeAbility ?? '',
      chargeDirX: player.chargeDirX ?? 0,
      chargeDirZ: player.chargeDirZ ?? 1,
      superweapon: player.superweapon ?? '',
      soulCharges: player.soulCharges ?? 0,
    });
  });

  const projectiles = new Map<string, ProjectileView>();
  state.projectiles.forEach((projectile, id) => {
    projectiles.set(id, {
      id,
      ownerId: projectile.ownerId,
      ability: projectile.ability,
      x: projectile.x,
      y: projectile.y,
      z: projectile.z,
    });
  });

  const barrels = new Map<string, BarrelView>();
  state.barrels?.forEach((barrel, id) => {
    barrels.set(id, {
      id,
      x: barrel.x,
      y: barrel.y,
      z: barrel.z,
      qx: barrel.qx ?? 0,
      qy: barrel.qy ?? 0,
      qz: barrel.qz ?? 0,
      qw: barrel.qw ?? 1,
      alive: barrel.alive,
    });
  });

  const destructibles = new Map<string, DestructibleView>();
  state.destructibles?.forEach((d, id) => {
    destructibles.set(id, {
      id,
      kind: d.kind,
      group: d.group,
      x: d.x,
      y: d.y,
      z: d.z,
      qx: d.qx,
      qy: d.qy,
      qz: d.qz,
      qw: d.qw,
      sx: d.sx,
      sy: d.sy,
      sz: d.sz,
      hp: d.hp ?? 0,
      maxHp: d.maxHp ?? 0,
      active: d.active,
    });
  });

  const structures = new Map<string, CoverStructureView>();
  state.structures?.forEach((s, id) => {
    structures.set(id, {
      id,
      assetId: s.assetId,
      x: s.x,
      z: s.z,
      rotation: s.rotation,
      radius: s.radius,
      height: s.height,
      hp: s.hp,
      maxHp: s.maxHp,
      destroyed: s.destroyed,
      lengthScale: s.lengthScale ?? 1,
    });
  });

  const pickables = new Map<string, PickableView>();
  state.pickables?.forEach((p, id) => {
    pickables.set(id, { id, kind: p.kind, x: p.x, y: p.y, z: p.z });
  });

  const groundZones = new Map<string, GroundZoneView>();
  state.groundZones?.forEach((z, id) => {
    groundZones.set(id, { id, kind: z.kind, x: z.x, z: z.z, radius: z.radius });
  });

  const traps = new Map<string, TrapView>();
  state.traps?.forEach((t, id) => {
    traps.set(id, {
      id,
      kind: t.kind,
      x: t.x,
      z: t.z,
      radius: t.radius,
      cooldownProgress: t.cooldownProgress,
      chargeProgress: t.chargeProgress,
    });
  });

  return { players, projectiles, barrels, destructibles, structures, pickables, groundZones, traps };
}

/** Map an ability cast event to a transient client-side VFX + a character
 *  animation event for the caster (so local and remote players animate alike). */
/**
 * Per-ability "on cast" VFX: which burst shader to spawn, where, and how it's
 * oriented. The traveling projectile (for projectile abilities) is replicated
 * and rendered separately by `Projectiles`; here we add the cast/impact flourish
 * — a ground burst at the caster/impact/target, oriented to the cast direction.
 */
type BurstSpawn = {
  id: VfxAssetId;
  at: 'caster' | 'point' | 'unit';
  y: number;
  oriented?: boolean;
  /** Track the anchor entity (caster/target) over the effect's lifetime, instead
   *  of pinning to the cast-time position. Use for body-centered swings/auras
   *  (cleave, nova, heal); leave off for ground impacts that should stay put. */
  follow?: boolean;
  /** Push the spawn this many units along the cast direction — for bursts that
   *  land in FRONT of the caster (e.g. a frontal smash) rather than on them. */
  forward?: number;
};

const ABILITY_CAST_VFX: Partial<Record<AbilityKind, BurstSpawn>> = {
  // Mage
  frost_nova: { id: 'vfx.frost', at: 'caster', y: 0.05, follow: true },
  arcane_blast: { id: 'vfx.arcane_blast', at: 'point', y: 0.05 }, // ground impact — stays
  // Warrior
  cleave: { id: 'vfx.cleave', at: 'caster', y: 0.9, oriented: true, follow: true },
  smash: { id: 'vfx.smash', at: 'caster', y: 0, oriented: true, follow: true, forward: 1.6 },
  ground_slam: { id: 'vfx.ground_slam', at: 'caster', y: 0.06, oriented: true, follow: true },
  // Dash streak: follows the dasher so the swoosh trails their back (the shader
  // fades toward the front, leaving the streak behind), oriented to travel.
  charge: { id: 'vfx.dash', at: 'caster', y: 0, oriented: true, follow: true },
  shield_wall: { id: 'vfx.cast', at: 'caster', y: 0.05, follow: true },
  tumble: { id: 'vfx.dash', at: 'caster', y: 0, oriented: true, follow: true },
  // Concussive volley: arrows rain down on the targeted point.
  crippling_shot: { id: 'vfx.arrow_volley', at: 'point', y: 0 },
  // Priest
  heal: { id: 'vfx.heal', at: 'caster', y: 0.1, follow: true },
  renew: { id: 'vfx.heal', at: 'unit', y: 0.1, follow: true }, // sticks to the healed target
  // Judgment (condemn) is a channelled beam — its visual is the sustained ray
  // (scene/ChannelBeams), not a one-shot cast burst.
  // Ninja
  ninja_e: { id: 'vfx.dash', at: 'caster', y: 0, oriented: true, follow: true },
};

/** Impact burst spawned when a projectile is blocked by cover, keyed by the
 *  projectile's source vfx tag. Magic pops with an arcane burst; physical shots
 *  get a neutral spark flash. */
const IMPACT_VFX: Record<string, VfxAssetId> = {
  fireball: 'vfx.arcane_blast',
  arcane_bolt: 'vfx.arcane_blast',
  holy_bolt: 'vfx.arcane_blast',
};
/** Height of a projectile impact burst (matches the projectile flight height). */
const IMPACT_Y = 1;

const lastNinjaQCast = new Map<string, number>();

function onAbilityCast(msg: ServerMessagePayloads[ServerMessage.AbilityCast]): void {
  const spawn = useEffectsStore.getState().spawn;
  const dir: [number, number, number] = [msg.dirX, 0, msg.dirZ];

  const caster = useGameStore.getState().players.get(msg.casterId);
  // Aim the caster's weapon down the ability line (remote players only; the local
  // player set its own aim with zero latency at cast time). The server-driven
  // `animState: 'cast'` triggers the weapon swing; this supplies its direction.
  // Done BEFORE any early-return so the ninja's teleport (R) still swings the
  // katana on remote bodies.
  if (caster && msg.casterId !== useGameStore.getState().sessionId) {
    setCastAim(msg.casterId, Math.atan2(msg.dirX, msg.dirZ), ABILITIES[msg.ability]?.channelMs ?? 0, msg.ability);
  }
  // Recolor the cast VFX to the caster's equipped weapon glow / enchant (null =
  // default). For the ninja with no enchant equipped this falls back to the
  // katana's showpiece color; once a ninja enchant exists it drives the tint.
  const tint = caster
    ? abilityTintColor(caster.characterClass, caster.weaponId, caster.enchantId) ?? undefined
    : undefined;

  if (msg.ability === 'ninja_r') {
    // Spawn smoke cloud at origin where the ninja was
    spawn('vfx.smoke_teleport', [msg.x, 0.05, msg.z], [0, 0, 1], undefined, undefined, undefined, tint);
    // Spawn smoke cloud at destination where the ninja will teleport
    if (msg.tx !== undefined && msg.tz !== undefined) {
      spawn('vfx.smoke_teleport', [msg.tx, 0.05, msg.tz], [0, 0, 1], undefined, undefined, undefined, tint);
    }
    return;
  }

  const aoeSizeBonus = caster
    ? computePerkModifiers([caster.perk1, caster.perk2, caster.perk3].filter(isPerkId)).aoeSizeBonus
    : 0;

  const def = ABILITIES[msg.ability];
  let baseRadius = def?.aoeRadius ?? 0;

  if (msg.ability === 'ninja_q') {
    const now = performance.now();
    const lastCast = lastNinjaQCast.get(msg.casterId) ?? 0;
    const isSecondSwing = now - lastCast < 450;
    if (isSecondSwing) {
      lastNinjaQCast.delete(msg.casterId);
      baseRadius = 4.5;
      // The second slash is a server-driven follow-up (+300ms), so the local
      // player never set its own aim for it (the remote-only guard above skips
      // it too). Bump the local cast aim here so the katana swings a second time
      // to match the second slash VFX.
      if (msg.casterId === useGameStore.getState().sessionId) {
        setCastAim(msg.casterId, Math.atan2(msg.dirX, msg.dirZ), 0, 'ninja_q');
      }
    } else {
      lastNinjaQCast.set(msg.casterId, now);
      baseRadius = 4.0;
    }
    const scale = baseRadius > 0 ? (baseRadius + aoeSizeBonus) / baseRadius : 1.0;
    const vfxId = isSecondSwing ? 'vfx.ninja_slash_2' : 'vfx.ninja_slash_1';
    spawn(vfxId, [msg.x, 0.9, msg.z], dir, msg.casterId, undefined, scale, tint);
    return;
  }

  const scale = baseRadius > 0 ? (baseRadius + aoeSizeBonus) / baseRadius : 1.0;

  const burst = ABILITY_CAST_VFX[msg.ability];
  if (burst) {
    let x = msg.x;
    let z = msg.z;
    // Entity this effect tracks over its lifetime (body-centered casts only).
    let followId: string | undefined;
    if (burst.at === 'point' && msg.tx !== undefined && msg.tz !== undefined) {
      x = msg.tx;
      z = msg.tz;
    } else if (burst.at === 'unit' && msg.targetId) {
      const target = useGameStore.getState().players.get(msg.targetId);
      if (target) {
        x = target.x;
        z = target.z;
      }
      if (burst.follow) followId = msg.targetId;
    } else if (burst.at === 'caster' && burst.follow) {
      followId = msg.casterId;
    }
    // Frontal offset along the cast direction. When the burst follows the caster
    // it's applied live each frame (stays ahead while running); otherwise it's
    // baked into the spawn point (a fixed spot in front).
    let offset: number | undefined;
    if (burst.forward) {
      if (followId) offset = burst.forward;
      else {
        x += msg.dirX * burst.forward;
        z += msg.dirZ * burst.forward;
      }
    }
    spawn(burst.id, [x, burst.y, z], burst.oriented ? dir : [0, 0, 1], followId, offset, scale, tint);
    return;
  }

  // Default (projectiles / single-target casts): a quick rune flash at the
  // caster's feet — the projectile itself carries the rest of the visual.
  if (def?.effects[0]?.type === 'aoe' || msg.tx !== undefined) {
    spawn('vfx.arcane_blast', [msg.tx ?? msg.x, 0.05, msg.tz ?? msg.z], [0, 0, 1], undefined, undefined, scale, tint);
  } else {
    spawn('vfx.cast', [msg.x, 0.05, msg.z], dir, undefined, undefined, undefined, tint);
  }
  // Cast poses are server-authoritative (replicated via `animState`) for remote
  // players; the local caster predicts its own in the ability hotkey.
}

/** Show a hit spark + damage number at the damaged player, and play a flinch.
 *  Death isn't an event — the state machine latches it from the replicated
 *  `alive` flag — so a lethal blow skips the flinch and goes to the death pose. */
function onDamage(msg: ServerMessagePayloads[ServerMessage.Damage]): void {
  const { players, sessionId } = useGameStore.getState();
  const target = players.get(msg.to);
  if (!target) return;
  const isMiniboss = target.skinId === 'skin.zombie.miniboss';

  if (msg.crit) {
    if (isZombieSkin(target.skinId) && !isMiniboss) {
      useEffectsStore.getState().spawn('vfx.blood_splash', [target.x, 1, target.z], [0, 0, 1]);
    } else {
      useEffectsStore.getState().spawn('vfx.cast', [target.x, 1, target.z], [0, 0, 1]);
    }
    spawnFloatingText(target.x, COMBAT_TEXT_Y, target.z, `CRIT! -${Math.round(msg.amount)}`, '#ffaa00');
  } else if (msg.ability === 'lightning_spark') {
    useEffectsStore.getState().spawn('vfx.lightning_spark', [target.x, 0.8, target.z], [0, 0, 1]);
    spawnFloatingText(target.x, COMBAT_TEXT_Y, target.z, `-${Math.round(msg.amount)}`, '#00d5ff');
  } else if (isZombieSkin(target.skinId) && !isMiniboss) {
    useEffectsStore.getState().spawn('vfx.blood_splash', [target.x, 1, target.z], [0, 0, 1]);
  } else {
    useEffectsStore.getState().spawn('vfx.cast', [target.x, 1, target.z], [0, 0, 1]);
    spawnFloatingText(target.x, COMBAT_TEXT_Y, target.z, `-${Math.round(msg.amount)}`, DAMAGE_COLOR);
  }
  // Local flinch is predicted; remote players' hit pose comes from server animState.
  if (!msg.lethal && (msg.to === sessionId || isMiniboss)) {
    pushAnimationEvent(msg.to, 'hit');
  } else if (msg.lethal && isMiniboss) {
    useGameStore.getState().triggerMinibossAlert('Dread Knight Slain! Healing Draught Dropped!');
  }
}

/** Show a healing number above the healed player. */
function onHeal(msg: ServerMessagePayloads[ServerMessage.Heal]): void {
  const target = useGameStore.getState().players.get(msg.to);
  if (!target) return;
  spawnFloatingText(target.x, COMBAT_TEXT_Y, target.z, `+${Math.round(msg.amount)}`, HEAL_COLOR);
}

/** A player leveled up: a gold flourish above them, plus a HUD toast for you. */
function onLevelUp(msg: ServerMessagePayloads[ServerMessage.LevelUp]): void {
  const { players, sessionId } = useGameStore.getState();
  const who = players.get(msg.sessionId);
  if (who) spawnFloatingText(who.x, LEVELUP_TEXT_Y, who.z, 'LEVEL UP!', LEVELUP_COLOR);
  if (msg.sessionId === sessionId) useLevelUpStore.getState().show(msg.level);
}

/** Options from the join screen, kept so portal travel can re-join as the same
 *  character (and account) without re-prompting. `token` carries the account
 *  identity; the server derives the authoritative display name from it. */
let joinOptions: {
  token: string;
  name: string;
  characterClass: CharacterClass;
  skinId?: string;
  dyeId?: string;
  pedestalId?: string;
  titleId?: string;
  rimId?: string;
  weaponId?: string;
  enchantId?: string;
  paintRev?: string;
  sessionKey: string;
} | null = null;
/** True while intentionally switching rooms, so `onLeave` doesn't reset to the
 *  join screen. */
let traveling = false;

/** Latched once we've started bailing out of a wedged connection, so repeated
 *  state patches on the dying room don't each trigger another leave. Cleared
 *  when a fresh room is wired or we fully leave. */
let bailing = false;

/**
 * A state patch (or a malformed one from a skewed server build) must never take
 * down the app: leave the room cleanly so `onLeave` resets us to the JoinScreen,
 * with a message explaining the drop, instead of throwing inside Colyseus's
 * decode loop.
 */
function bailToJoinScreen(reason: unknown): void {
  if (bailing) return;
  bailing = true;
  console.error('[net] dropping connection after a fatal sync error:', reason);
  reportClientError('sync-error', { reason });
  const current = room;
  room = null;
  // Detach before the background leave so a late event can't fire into the next
  // session (see leaveToCharacterSelect).
  current?.removeAllListeners();
  disconnectMatchmaking();
  disconnectZombieMatchmaking();
  useGameStore.getState().reset();
  useGameStore.getState().setStatus('error', 'Lost sync with the server — please rejoin.');
  if (current) void current.leave().catch(() => {});
}

/** Wrap a discrete message handler so a bug in cosmetic feedback (a VFX, a
 *  floating number) is logged and swallowed rather than thrown into Colyseus. */
function guarded<T>(fn: (msg: T) => void): (msg: T) => void {
  return (msg) => {
    try {
      fn(msg);
    } catch (err) {
      console.error('[net] message handler error (ignored):', err);
      reportClientError('message-handler', { reason: err });
    }
  };
}

/** Wire a freshly-joined room's state + messages into the stores. */
function wireRoom(joined: Room): void {
  bailing = false; // fresh connection
  lastPatchAt = performance.now(); // start the watchdog clock fresh
  setTelemetryContext({ sessionId: joined.sessionId, room: joined.name });
  useConnectionStore.getState().setLost(false);
  clearSnapshots(); // fresh interpolation timeline per room (no cross-room bleed)
  useCoopStore.getState().reset(); // fresh co-op death/spectate state per room
  // A teleport (portal/scene change) cancels any pending move order — arrive
  // idle and wait for the next command, rather than resuming a stale walk.
  clearDestination();
  joined.onStateChange((state) => {
    try {
      const raw = state as unknown as RawState;
      const { players, projectiles, barrels, destructibles, structures, pickables, groundZones, traps } =
        snapshotState(raw);
      useGameStore
        .getState()
        .applySnapshot(
          players,
          projectiles,
          barrels,
          destructibles,
          structures,
          pickables,
          groundZones,
          traps,
          raw.tick,
        );
      // Arena rooms sync a layout seed; the scene rebuilds cover from it.
      if (raw.layoutSeed) useGameStore.getState().setArenaSeed(raw.layoutSeed);
      // Zombie survival: mirror the replicated wave counters for the HUD.
      useGameStore
        .getState()
        .setZombie(
          raw.zombieMode ?? false,
          raw.zombieLevel ?? 0,
          raw.zombiesRemaining ?? 0,
          raw.zombiesAlive ?? 0,
          raw.coopZombie ?? false,
          raw.unlockedSections ?? 0,
          raw.altarGemsLit ?? 0,
        );
      // Feed the interpolation buffer used to render remote players smoothly.
      const now = performance.now();
      recordSnapshots(players, now);
      // State is flowing — note the time and clear any "connection lost" overlay.
      lastPatchAt = now;
      if (useConnectionStore.getState().lost) useConnectionStore.getState().setLost(false);
    } catch (err) {
      // e.g. a server/client schema skew — degrade to a clean disconnect.
      bailToJoinScreen(err);
    }
  });

  // Identity is read from `room.sessionId`; the Welcome message is acknowledged
  // here only so colyseus.js doesn't warn about an unhandled type.
  joined.onMessage(ServerMessage.Welcome, () => {});

  // Combat events only fire in the arena; harmless to listen for everywhere.
  // Guarded so a bug in a VFX/feedback handler can't crash the connection.
  joined.onMessage(ServerMessage.AbilityCast, guarded(onAbilityCast));
  joined.onMessage(ServerMessage.Damage, guarded(onDamage));
  joined.onMessage(ServerMessage.Heal, guarded(onHeal));
  joined.onMessage(ServerMessage.LevelUp, guarded(onLevelUp));
  joined.onMessage(ServerMessage.ResetCooldown, (msg) => {
    resetCooldowns(msg?.ability);
  });
  joined.onMessage(ServerMessage.Chat, (msg) => {
    useChatStore.getState().add(msg);
    if (msg.senderId) useSpeechStore.getState().say(msg.senderId, msg.text);
  });
  joined.onMessage(ServerMessage.ChatHistory, (msg) => useChatStore.getState().set(msg.messages));

  // Matchmaking lives on a separate connection (see wireMatchmaking); the town
  // gameplay room only carries world state + combat/chat events.
  joined.onMessage(ServerMessage.MatchOver, (msg) => useMatchResultStore.getState().set(msg));
  joined.onMessage(ServerMessage.ProjectileImpact, (msg) =>
    useEffectsStore.getState().spawn(IMPACT_VFX[msg.ability] ?? 'vfx.cast', [msg.x, IMPACT_Y, msg.z]),
  );
  joined.onMessage(ServerMessage.BarrelExplosion, (msg) => {
    // The same fireball as a car detonation, scaled down for the smaller barrel.
    useEffectsStore.getState().spawn('vfx.barrel_explosion', [msg.x, 0, msg.z]);
  });
  joined.onMessage(ServerMessage.DestructibleHit, (msg) => {
    // A small impact puff where a spell struck a destructible — NOT a blast.
    useEffectsStore.getState().spawn('vfx.cast', [msg.x, msg.y, msg.z]);
  });
  joined.onMessage(ServerMessage.StructureCrumbled, (msg) => {
    // A dust/debris burst where a cover structure collapsed (no damage — the
    // server already applied it; this is just the crumble feedback).
    useEffectsStore.getState().spawn('vfx.shockwave', [msg.x, 0.05, msg.z]);
  });
  joined.onMessage(ServerMessage.ChestSpawned, (msg) => {
    useEffectsStore.getState().spawn('vfx.chest_spawn', [msg.x, 0.05, msg.z]);
  });
  joined.onMessage(ServerMessage.CarExplosion, (msg) => {
    // A car detonated: a fireball + ground shock (the server already dealt the
    // 100-damage area blast — this is the explosion VFX).
    useEffectsStore.getState().spawn('vfx.car_explosion', [msg.x, 0, msg.z]);
  });
  joined.onMessage(ServerMessage.ZombieGameOver, (msg) => {
    // Co-op squad wiped — show the defeat screen (CoopOverlay returns to town).
    useCoopStore.getState().setGameOver(msg.level);
  });
  joined.onMessage(ServerMessage.Detonation, (msg) => {
    // A thrown pickable burst (server already applied the area damage). The
    // grenade gets the bigger fireball; the molotov a smaller fire pop (its
    // lingering puddle renders separately from replicated ground-zone state).
    let vfxId: VfxAssetId = 'vfx.barrel_explosion';
    let scale: number | undefined;
    let tint: string | undefined;
    if (msg.kind === 'grenade') {
      vfxId = 'vfx.car_explosion';
    } else if (msg.kind === 'chain_explosion') {
      vfxId = 'vfx.barrel_explosion';
      scale = msg.radius / 4.0;
    } else if (msg.kind === 'singularity') {
      // The black-hole trap's sci-fi blast, sized to its radius (the shader's
      // shockwave front reaches r=1 at the quad half-width = size/2 = 1).
      vfxId = 'vfx.singularity_blast';
      scale = msg.radius;
    } else if (msg.kind === 'shield_burst') {
      // Golden Runic Blast (arcane blast shader tinted gold) matching the exact radius
      vfxId = 'vfx.arcane_blast';
      scale = msg.radius / 4.275;
      tint = '#ffe066';
    }
    useEffectsStore
      .getState()
      .spawn(vfxId, [msg.x, 0, msg.z], [0, 0, 1], undefined, undefined, scale, tint);
  });
  joined.onMessage(ServerMessage.HealTrap, (msg) => {
    // A heal trap fired (server already healed everyone) — the heal-beam VFX is
    // sized to the trap radius via the spawn scale so the light curtain lands on
    // the ring.
    useEffectsStore
      .getState()
      .spawn('vfx.heal_beam', [msg.x, 0, msg.z], [0, 0, 1], undefined, undefined, msg.radius);
  });
  joined.onMessage(ServerMessage.Leaderboard, (msg) =>
    useLeaderboardStore.getState().set(msg.category, msg.enabled, msg.entries),
  );
  joined.onMessage(ServerMessage.PerkOffer, (msg: ServerMessagePayloads[typeof ServerMessage.PerkOffer]) => {
    usePerkStore.getState().setOffer({
      visible: msg.visible,
      isUpgrade: msg.isUpgrade,
      fixedUpgradeFrom: msg.fixedUpgradeFrom,
      fixedUpgradeTo: msg.fixedUpgradeTo,
    });
  });


  joined.onError((code, message) => {
    // A room error doesn't necessarily close the socket — surface the
    // "connection lost" overlay over the (now unreliable) game rather than
    // silently leaving it frozen.
    console.error(`[net] room error ${code}: ${message ?? ''}`);
    reportClientError('room-error', { message: message ?? `room error ${code}`, code });
    useConnectionStore.getState().setLost(true);
  });

  joined.onLeave((code) => {
    bailing = false;
    if (traveling) return; // an intentional room switch — keep playing
    // True only when the app didn't initiate this leave (a local teardown nulls
    // `room` first) — i.e. the socket dropped out from under us.
    const unexpected = room === joined;
    teardownSession();
    // Distinguish a deliberate "newest session wins" kick from a random drop so
    // the join screen explains why, rather than looking like a crash.
    if (code === SESSION_SUPERSEDED_CODE) {
      useGameStore.getState().setStatus('error', 'You signed in on another tab or device.');
    } else if (unexpected) {
      // The single most diagnostic value for "in-game → join screen": the WS
      // close code (1000 normal, 1001 going away, 1006 abnormal, 4xxx app).
      reportClientError('disconnect', { message: `connection lost (code ${code})`, code });
    }
  });
}

/** Drop the gameplay session and clear its stores so the app falls back to the
 *  JoinScreen. Idempotent — safe to call locally (Change Character) and again
 *  from `onLeave` when the socket actually closes. */
function teardownSession(): void {
  room = null;
  setTelemetryContext({}); // no active session/room to tag reports with
  useConnectionStore.getState().setLost(false);
  disconnectMatchmaking(); // drop the parallel lobby connection too
  disconnectZombieMatchmaking();
  useCoopStore.getState().reset();
  useGameStore.getState().reset();
  useChatStore.getState().clear();
  useSpeechStore.getState().clear();
  useMatchResultStore.getState().clear();
}

// --- Matchmaking lobby connection (parallel to the town room) ---------------

/** The lobby/matchmaking connection, kept open alongside the town room so the
 *  browser stays live while the player walks around town. Strictly separate
 *  from the gameplay `room` — it has its own minimal wiring (no `wireRoom`). */
let mmRoom: Room | null = null;
/** Bumped on every connect/disconnect so an in-flight `joinOrCreate` that
 *  resolves after the player has already left town can detect it's stale and
 *  drop the orphaned connection instead of leaking it. */
let mmGeneration = 0;

/** Structural view of the runtime matchmaking state (read like the game state,
 *  through minimal shapes rather than the server schema classes). */
interface RawQueueMember {
  sessionId: string;
  townSessionId: string;
  mode: LobbyMode;
  partyId: string;
  enqueuedAt: number;
}
interface RawMmState {
  members: { forEach(cb: (m: RawQueueMember, key: string) => void): void };
}

function snapshotMembers(state: RawMmState): QueueMemberView[] {
  const members: QueueMemberView[] = [];
  state.members.forEach((m) =>
    members.push({
      sessionId: m.sessionId,
      townSessionId: m.townSessionId,
      mode: m.mode,
      partyId: m.partyId,
      enqueuedAt: m.enqueuedAt,
    }),
  );
  return members;
}

/** Tell the matchmaking room our TOWN session id so peers can invite us (the
 *  matchmaking session id differs from the town one). Sent once both are known. */
function registerTownPresence(): void {
  const townSessionId = useGameStore.getState().sessionId;
  if (mmRoom && townSessionId) mmRoom.send(ClientMessage.MmRegisterTown, { townSessionId });
}

function wireMatchmaking(joined: Room): void {
  joined.onStateChange((state) => {
    useQueueStore.getState().setMembers(snapshotMembers(state as unknown as RawMmState));
  });
  joined.onMessage(ServerMessage.MatchFound, (msg) => {
    // Tear down both matchmaking connections, then consume the seat into the arena.
    disconnectMatchmaking();
    disconnectZombieMatchmaking();
    useMatchResultStore.getState().clear();
    void joinByReservation(msg.reservation);
  });
  joined.onMessage(ServerMessage.MatchInvite, (msg) => {
    useInviteStore.getState().show({ inviteId: msg.inviteId, fromName: msg.fromName, mode: msg.mode });
  });
  joined.onMessage(ServerMessage.LobbyError, (msg) => {
    useQueueStore.getState().setError(msg.message);
  });
  joined.onError((code, message) => {
    console.error(`[mm] room error ${code}: ${message ?? ''}`.trim());
    reportClientError('matchmaking-error', { message: message ?? `mm room error ${code}`, code });
  });
  joined.onLeave(() => {
    // No report here: the matchmaking connection is dropped intentionally on every
    // match transition (and on leaving town), so a leave isn't a fault.
    if (mmRoom === joined) mmRoom = null;
    useQueueStore.getState().reset();
  });
}

/** Open the matchmaking connection (idempotent). Reuses the town join options so
 *  the matchmaking room sees the same account/class as the player's town avatar. */
export async function connectMatchmaking(): Promise<void> {
  if (!client || !joinOptions || mmRoom) return;
  const generation = mmGeneration;
  try {
    const joined = await client.joinOrCreate(MATCHMAKING_ROOM, joinOptions);
    // We left town (or reconnected) while this join was in flight — the result
    // is stale, so drop it rather than leaking an orphaned connection.
    if (generation !== mmGeneration) {
      void joined.leave().catch(() => {});
      return;
    }
    mmRoom = joined;
    useQueueStore.getState().setSession(joined.sessionId);
    wireMatchmaking(joined);
    // Bridge town↔matchmaking identity (best-effort; re-sent on town join too, to
    // beat the race where the town session isn't known yet at connect time).
    registerTownPresence();
  } catch (err) {
    console.error('[mm] failed to connect to matchmaking:', err);
    reportClientError('matchmaking-error', {
      message: 'failed to connect to matchmaking',
      reason: err,
    });
  }
}

/** Close the matchmaking connection and clear the queue UI (no-op if not connected). */
export function disconnectMatchmaking(): void {
  mmGeneration++; // invalidate any in-flight connectMatchmaking
  const current = mmRoom;
  mmRoom = null;
  useQueueStore.getState().reset();
  if (current) void current.leave().catch(() => {});
}

// --- Co-op Zombie matchmaking connection (parallel to the town room) --------

/** The co-op zombie lobby connection, kept open alongside the town room (a second
 *  singleton registry, separate from the team-vs-team {@link mmRoom}). */
let zmmRoom: Room | null = null;
let zmmGeneration = 0;

/** Structural view of the runtime co-op zombie matchmaking state. */
interface RawZombieSlot {
  sessionId: string;
  name: string;
  characterClass: ZombieLobbyView['members'][number]['characterClass'];
  index: number;
}
interface RawZombieLobby {
  id: string;
  name: string;
  hostId: string;
  isPrivate: boolean;
  code: string;
  status: ZombieLobbyView['status'];
  members: { forEach(cb: (slot: RawZombieSlot) => void): void };
}
interface RawZombieMmState {
  lobbies: { forEach(cb: (lobby: RawZombieLobby, key: string) => void): void };
}

function snapshotZombieLobbies(state: RawZombieMmState): ZombieLobbyView[] {
  const lobbies: ZombieLobbyView[] = [];
  state.lobbies.forEach((lobby) => {
    const members: ZombieLobbyView['members'] = [];
    lobby.members.forEach((m) =>
      members.push({
        sessionId: m.sessionId,
        name: m.name,
        characterClass: m.characterClass,
        index: m.index,
      }),
    );
    members.sort((a, b) => a.index - b.index);
    lobbies.push({
      id: lobby.id,
      name: lobby.name,
      hostId: lobby.hostId,
      isPrivate: lobby.isPrivate,
      code: lobby.code,
      status: lobby.status,
      members,
    });
  });
  return lobbies;
}

function wireZombieMatchmaking(joined: Room): void {
  joined.onStateChange((state) => {
    useZombieLobbyStore
      .getState()
      .setLobbies(snapshotZombieLobbies(state as unknown as RawZombieMmState));
  });
  joined.onMessage(ServerMessage.MatchFound, (msg) => {
    // The host started the run: drop the lobby connection and consume the seat.
    disconnectZombieMatchmaking();
    useMatchResultStore.getState().clear();
    void joinByReservation(msg.reservation);
  });
  joined.onMessage(ServerMessage.LobbyError, (msg) => {
    useZombieLobbyStore.getState().setError(msg.message);
  });
  joined.onError((code, message) => {
    console.error(`[z-mm] room error ${code}: ${message ?? ''}`.trim());
    reportClientError('matchmaking-error', { message: message ?? `z-mm room error ${code}`, code });
  });
  joined.onLeave(() => {
    if (zmmRoom === joined) zmmRoom = null;
    useZombieLobbyStore.getState().reset();
  });
}

/** Open the co-op zombie lobby connection (idempotent). */
export async function connectZombieMatchmaking(): Promise<void> {
  if (!client || !joinOptions || zmmRoom) return;
  const generation = zmmGeneration;
  try {
    const joined = await client.joinOrCreate(ZOMBIE_MATCHMAKING_ROOM, joinOptions);
    if (generation !== zmmGeneration) {
      void joined.leave().catch(() => {});
      return;
    }
    zmmRoom = joined;
    useZombieLobbyStore.getState().setSession(joined.sessionId);
    wireZombieMatchmaking(joined);
  } catch (err) {
    console.error('[z-mm] failed to connect to zombie matchmaking:', err);
    reportClientError('matchmaking-error', {
      message: 'failed to connect to zombie matchmaking',
      reason: err,
    });
  }
}

/** Close the co-op zombie lobby connection and clear its UI. */
export function disconnectZombieMatchmaking(): void {
  zmmGeneration++;
  const current = zmmRoom;
  zmmRoom = null;
  useZombieLobbyStore.getState().reset();
  if (current) void current.leave().catch(() => {});
}

/** Return to the character-select screen (staying signed in). Tears the session
 *  down LOCALLY and immediately so the UI snaps to the JoinScreen without waiting
 *  on the server's leave/close handshake (which can stall if the room is wedged);
 *  the network `leave()` is fired in the background. Used by the town's "Change
 *  Character" control. */
export function leaveToCharacterSelect(): void {
  const current = room;
  if (!current) return;
  // Detach this room's listeners BEFORE the background leave: otherwise its late
  // onLeave/onStateChange/onError land after we've already re-joined as a new
  // character and clobber that fresh session — onLeave re-runs teardownSession
  // (nulling the new `room` + resetting stores), and a trailing onStateChange
  // writes the old player back in, so the new character flickers to the old one.
  // (The travelTo / world-swap paths guard the same race the same way.)
  current.removeAllListeners();
  teardownSession(); // nulls `room`, resets stores → App renders JoinScreen now
  void current.leave().catch(() => {
    /* already gone — the local teardown already returned us to the JoinScreen */
  });
}

/** Join a world for the first time (from the character-select screen). Identity
 *  (token + display name) comes from the signed-in account. */
/** Build the join payload for a class from the player's account + equipped look
 *  for that class. Shared by the first join, world swaps, and character changes. */
function buildJoinOptions(characterClass: CharacterClass): void {
  const { token, username } = useAuthStore.getState();
  // The look the player joins with comes from their equipped loadout for this class.
  const look = useCosmeticsStore.getState().appearanceFor(characterClass);
  joinOptions = {
    token: token ?? '',
    name: username ?? 'Adventurer',
    characterClass,
    skinId: look.skinId,
    dyeId: look.dyeId,
    pedestalId: look.pedestalId,
    titleId: look.titleId,
    rimId: look.rimId,
    weaponId: look.weaponId,
    enchantId: look.enchantId,
    paintRev: usePaintStore.getState().revFor(characterClass),
    sessionKey: TAB_SESSION,
  };
}

export async function connectToRoom(
  roomType: RoomType,
  characterClass: CharacterClass,
): Promise<void> {
  buildJoinOptions(characterClass);
  const store = useGameStore.getState();
  store.reset();
  resetCooldowns();
  clearFloatingText();
  useLevelUpStore.getState().clear();
  useChatStore.getState().clear();
  useSpeechStore.getState().clear();
  useMatchResultStore.getState().clear();
  store.setStatus('connecting');

  try {
    client ??= new Client(ENDPOINT);
    room = await client.joinOrCreate(ROOM_HANDLER[roomType], joinOptions);
    store.setSessionId(room.sessionId);
    store.setRoom(roomType);
    store.setStatus('connected');
    wireRoom(room);
    // Open the lobby browser connection alongside the town hub.
    if (roomType === 'town') {
      void connectMatchmaking();
      void connectZombieMatchmaking();
    }
  } catch (err) {
    room = null;
    const message = err instanceof Error ? err.message : 'Failed to connect';
    store.setStatus('error', message);
    reportClientError('join-failed', { message: `failed to join ${roomType}`, reason: err });
    throw err;
  }
}

/** Resolve once the local player (with a resolved character class) is present in
 *  the store — or after `timeoutMs` as a backstop so we never hang. Used to hold
 *  a world-swap's loading cover up until the new character is actually
 *  renderable: `joinOrCreate` resolves a beat before the first state sync, so
 *  dropping the cover immediately briefly renders the scene with no class set,
 *  which falls back to the default (warrior) model. */
function waitForLocalPlayer(sessionId: string, timeoutMs = 2500): Promise<void> {
  const ready = () => !!useGameStore.getState().players.get(sessionId)?.characterClass;
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsub();
      clearTimeout(timer);
      resolve();
    };
    const unsub = useGameStore.subscribe(() => {
      if (ready()) finish();
    });
    const timer = setTimeout(finish, timeoutMs);
  });
}

/** Switch worlds (town ↔ arena) as the same character — used by portals. Keeps
 *  the UI on the game (no flash back to the join screen). Pass `{ zombie: true }`
 *  to enter the zombie-survival arena (a distinct co-op room handler); the client
 *  still tracks it as the 'arena' room type, since it renders the same scene. */
export async function travelTo(
  roomType: RoomType,
  options?: { zombie?: boolean; label?: string },
): Promise<void> {
  if (!client || !joinOptions || traveling) return;
  // The zombie horde is a distinct room handler; we still track it client-side
  // as the 'arena' room (it renders the same scene).
  const isZombie = !!options?.zombie;
  const handler = options?.zombie ? ZOMBIE_ROOM : ROOM_HANDLER[roomType];
  const store = useGameStore.getState();
  // Front-run the zombie GLBs so the first wave's models are parsed before they
  // spawn (otherwise the first of each variant hitches on download + parse).
  if (isZombie) preloadZombieModels();
  traveling = true;
  // Cover the world swap with the branded loading screen.
  store.setTransitioning(
    true,
    options?.label ??
      (options?.zombie
        ? 'Entering the horde…'
        : roomType === 'arena'
          ? 'Entering the arena…'
          : 'Returning to town…'),
  );
  // Matchmaking only exists in town: drop it when leaving for the arena (it's
  // reopened below when arriving in town).
  disconnectMatchmaking();
  disconnectZombieMatchmaking();
  try {
    // Leave the old world without waiting out the close round-trip — but detach
    // its listeners first so its late onLeave/onError/onStateChange can't bleed
    // into the new session (that race was bouncing players to character select).
    if (room) {
      const previous = room;
      room = null;
      previous.removeAllListeners();
      void previous.leave().catch(() => {});
    }
    // Clear the old world's transient state; stay 'connected' so the scene stays up.
    store.players.clear();
    store.projectiles.clear();
    resetCooldowns();
    clearFloatingText();
  useLevelUpStore.getState().clear();
    useChatStore.getState().clear();
  useSpeechStore.getState().clear();
  useMatchResultStore.getState().clear();

    const t0 = performance.now();
    room = await client.joinOrCreate(handler, joinOptions);
    console.debug(`[travel] join ${handler} took ${Math.round(performance.now() - t0)}ms`);
    store.setSessionId(room.sessionId);
    store.setRoom(roomType);
    store.setStatus('connected');
    wireRoom(room);
    if (roomType === 'town') {
      void connectMatchmaking();
      void connectZombieMatchmaking();
    }
    // Keep the loading cover up until the new character is actually in the store,
    // so the scene/HUD never flash the default model in the pre-first-sync gap.
    await waitForLocalPlayer(room.sessionId);
  } catch (err) {
    room = null;
    store.setStatus('error', err instanceof Error ? err.message : 'Failed to travel');
    reportClientError('join-failed', { message: `failed to travel to ${roomType}`, reason: err });
  } finally {
    traveling = false;
    store.setTransitioning(false);
  }
}

/** Switch the local player to a different class without leaving town — rebuilds
 *  the join payload for the new champion (its equipped look) and does the same
 *  smooth, covered room swap as a portal, so there's no flash back to the
 *  character-select screen. The choice is persisted via `useCharacterStore`. */
export async function changeCharacter(characterClass: CharacterClass): Promise<void> {
  if (!client || traveling) return;
  if (joinOptions?.characterClass === characterClass) return; // already this class
  useCharacterStore.getState().setSelectedClass(characterClass);
  buildJoinOptions(characterClass);
  await travelTo('town', { label: 'Switching champion…' });
}

/** Consume a matchmaking seat reservation and enter the dedicated 1v1 arena. */
async function joinByReservation(reservation: unknown): Promise<void> {
  if (!client || traveling) return;
  const store = useGameStore.getState();
  traveling = true;
  store.setTransitioning(true, 'Entering the arena…');
  disconnectMatchmaking(); // belt-and-braces: the match-found handler already did
  disconnectZombieMatchmaking();
  try {
    // Detach + non-blocking leave of the old world (see travelTo).
    if (room) {
      const previous = room;
      room = null;
      previous.removeAllListeners();
      void previous.leave().catch(() => {});
    }
    store.players.clear();
    store.projectiles.clear();
    resetCooldowns();
    clearFloatingText();
  useLevelUpStore.getState().clear();
    useChatStore.getState().clear();
  useSpeechStore.getState().clear();
  useMatchResultStore.getState().clear();

    // The reservation shape is internal to Colyseus; consume it directly.
    const t0 = performance.now();
    room = await client.consumeSeatReservation(reservation as never);
    console.debug(`[travel] consume arena seat took ${Math.round(performance.now() - t0)}ms`);
    store.setSessionId(room.sessionId);
    store.setRoom('arena');
    store.setStatus('connected');
    wireRoom(room);
    // Hold the cover until the character is in the store (see waitForLocalPlayer).
    await waitForLocalPlayer(room.sessionId);
  } catch (err) {
    room = null;
    store.setStatus('error', err instanceof Error ? err.message : 'Failed to join match');
    reportClientError('join-failed', { message: 'failed to consume arena reservation', reason: err });
  } finally {
    traveling = false;
    store.setTransitioning(false);
  }
}

// --- Matchmaking intents (sent on the matchmaking connection) --------------

/** Join (or switch to) the queue for a format. */
export function sendJoinQueue(mode: LobbyMode): void {
  mmRoom?.send(ClientMessage.JoinQueue, { mode });
}

/** Leave the queue you're currently in. */
export function sendLeaveQueue(): void {
  mmRoom?.send(ClientMessage.LeaveQueue, {});
}

/** Invite a specific player (by their TOWN session id) to a format. */
export function sendInviteToMatch(targetSessionId: string, mode: LobbyMode): void {
  mmRoom?.send(ClientMessage.InviteToMatch, { targetSessionId, mode });
}

/** Accept or decline a received match invite. */
export function sendInviteRespond(inviteId: string, accept: boolean): void {
  mmRoom?.send(ClientMessage.InviteRespond, { inviteId, accept });
}

// --- Co-op Zombie matchmaking intents (sent on the zombie lobby connection) ---

/** Create a co-op zombie squad lobby (public or private). */
export function sendZombieCreateLobby(name: string, isPrivate: boolean): void {
  zmmRoom?.send(ClientMessage.ZombieCreateLobby, { name, isPrivate });
}

/** Join a public co-op squad lobby from the browser. */
export function sendZombieJoinLobby(lobbyId: string): void {
  zmmRoom?.send(ClientMessage.ZombieJoinLobby, { lobbyId });
}

/** Join a private co-op squad lobby by its share code. */
export function sendZombieJoinByCode(code: string): void {
  zmmRoom?.send(ClientMessage.ZombieJoinByCode, { code });
}

/** Leave the co-op squad lobby you're in. */
export function sendZombieLeaveLobby(): void {
  zmmRoom?.send(ClientMessage.ZombieLeaveLobby, {});
}

/** Host: launch the co-op run (1–5 players). */
export function sendZombieStartMatch(): void {
  zmmRoom?.send(ClientMessage.ZombieStartMatch, {});
}

/** Play an emote (dance), replicated to everyone in the room. */
export function sendEmote(emote: string): void {
  room?.send(ClientMessage.Emote, { emote });
}

/** Update the player's live appearance (skin/dye/title) so everyone in the room
 *  sees it immediately. Also kept in `joinOptions` so a room change carries it. */
export function sendEquipLoadout(look: Appearance): void {
  if (joinOptions) {
    joinOptions.skinId = look.skinId;
    joinOptions.dyeId = look.dyeId;
    joinOptions.pedestalId = look.pedestalId;
    joinOptions.titleId = look.titleId;
    joinOptions.rimId = look.rimId;
    joinOptions.weaponId = look.weaponId;
    joinOptions.enchantId = look.enchantId;
  }
  room?.send(ClientMessage.EquipLoadout, look);
}

/** Broadcast a new custom-paint revision for the given class so peers refetch the
 *  paint PNG. Sends the full current appearance alongside it (the EquipLoadout
 *  handler resolves every slot), so this never clears equipped cosmetics. */
export function sendPaintRev(characterClass: CharacterClass, paintRev: string): void {
  if (joinOptions?.characterClass === characterClass) joinOptions.paintRev = paintRev;
  const look = useCosmeticsStore.getState().appearanceFor(characterClass);
  room?.send(ClientMessage.EquipLoadout, { ...look, paintRev });
}

export function requestLeaderboard(category: LeaderboardCategory = 'wins'): void {
  room?.send(ClientMessage.RequestLeaderboard, { category });
}

/** Update the world-space point to move toward (hold-to-move). */
export function sendMoveTo(x: number, z: number): void {
  room?.send(ClientMessage.MoveTo, { x, z });
}

/** Stop mouse-driven movement immediately (right mouse button released). */
export function sendStopMove(): void {
  room?.send(ClientMessage.StopMove, {});
}

/** Request a jump; the server applies it only when grounded. */
export function sendJump(): void {
  room?.send(ClientMessage.Jump, {});
}

/** Spacebar in the arena: grab a nearby pickable, or throw the carried one. */
export function sendInteract(): void {
  room?.send(ClientMessage.Interact, {});
}

/** Set the auto-attack target (attack-move toward a player and strike). */
export function sendAttack(targetId: string): void {
  room?.send(ClientMessage.Attack, { targetId });
}

/** Mark a hold-to-aim ability as being charged (held), or clear it (ability '').
 *  Replicated so other players see the wind-up before the cast. */
export function sendSetCharge(ability: string, dirX: number, dirZ: number): void {
  room?.send(ClientMessage.SetCharge, { ability, dirX, dirZ });
}

/** Request to cast an ability in a direction (with an optional ground target or
 *  locked unit target). */
export function sendCast(
  ability: AbilityKind,
  dirX: number,
  dirZ: number,
  tx?: number,
  tz?: number,
  targetId?: string,
): void {
  room?.send(ClientMessage.CastAbility, { ability, dirX, dirZ, tx, tz, targetId });
}

/** Stream a new aim direction for the active channel (the priest beam) so the
 *  ray tracks the cursor while channelling. */
export function sendAimChannel(dirX: number, dirZ: number): void {
  room?.send(ClientMessage.AimChannel, { dirX, dirZ });
}

/** Send a global chat message to the current room. */
export function sendChat(text: string): void {
  room?.send(ClientMessage.Chat, { text });
}

/** Zombie perk progression: pick slot 0 (visible A), 1 (visible B / fixed
 *  upgrade), or 2 (jolly). `upgradeTarget` is the perk to upgrade when using
 *  the free-choice path during upgrade waves. */
export function sendPerkPick(slot: number, upgradeTarget?: string): void {
  room?.send(ClientMessage.PerkPick, { slot, upgradeTarget });
}
/** Dev-only: push live movement tuning to the authoritative server. */
export function sendDevTune(values: ClientMessagePayloads[ClientMessage.DevTune]): void {
  room?.send(ClientMessage.DevTune, values);
}

/** Dev-only: push live ability balance overrides to the authoritative server. */
export function sendAbilityTune(values: ClientMessagePayloads[ClientMessage.AbilityTune]): void {
  room?.send(ClientMessage.AbilityTune, values);
}

/** Dev-only: push live per-class stat overrides to the authoritative server. */
export function sendStatTune(values: ClientMessagePayloads[ClientMessage.StatTune]): void {
  room?.send(ClientMessage.StatTune, values);
}

/** Dev-only: set the arena's practice-bot population and AI difficulty. */
export function sendBotControl(values: ClientMessagePayloads[ClientMessage.BotControl]): void {
  room?.send(ClientMessage.BotControl, values);
}

/** Dev-only: grant a zombie perk to the local player, or clear all perks. */
export function sendDevGrantPerk(values: ClientMessagePayloads[ClientMessage.DevGrantPerk]): void {
  room?.send(ClientMessage.DevGrantPerk, values);
}

/** Dev-only: add `amount` character levels to the local player. */
export function sendDevAddLevel(amount: number): void {
  room?.send(ClientMessage.DevAddLevel, { amount });
}

/** Dev-only: spawn a trap at a location. */
export function sendDevSpawnTrap(values: ClientMessagePayloads[ClientMessage.DevSpawnTrap]): void {
  room?.send(ClientMessage.DevSpawnTrap, values);
}

/** Dev-only: jump the zombie run to `wave` (opens doors unlocked by then). */
export function sendDevSetWave(wave: number): void {
  room?.send(ClientMessage.DevSetWave, { wave });
}

/** Resonance of the Void: start/stop channelling the altar ritual. */
export function sendRitualChannel(active: boolean): void {
  room?.send(ClientMessage.RitualChannel, { active });
}

/** Toggle the auto-attack feature flag for the current room. */
export function sendSetAutoAttack(enabled: boolean): void {
  room?.send(ClientMessage.SetAutoAttack, { enabled });
}

/** Leave the current room, if any. */
export function disconnect(): void {
  const current = room;
  // Detach first so a late onLeave/onStateChange from this room can't fire into a
  // subsequent session (see leaveToCharacterSelect). Since detaching means its
  // onLeave won't run the cleanup, do the full teardown here explicitly.
  current?.removeAllListeners();
  teardownSession();
  current?.leave(true);
}
