import { Client, type Room } from 'colyseus.js';
import {
  ABILITIES,
  ARENA_ROOM,
  MATCHMAKING_ROOM,
  SESSION_SUPERSEDED_CODE,
  TOWN_ROOM,
  ClientMessage,
  ServerMessage,
  type AbilityKind,
  type BarrelView,
  type CharacterClass,
  type CoverStructureView,
  type DestructibleView,
  type ClientMessagePayloads,
  type LobbyMode,
  type LobbySlotView,
  type LobbyStatus,
  type LobbyView,
  type PlayerView,
  type ProjectileView,
  type ServerMessagePayloads,
  type Team,
  type VfxAssetId,
} from '@arena/shared';
import { useGameStore, type RoomType } from '../store/useGameStore';
import { useChatStore } from '../store/useChatStore';
import { useSpeechStore } from '../store/useSpeechStore';
import { useLobbyStore } from '../store/useLobbyStore';
import { useMatchResultStore } from '../store/useMatchResultStore';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { useLevelUpStore } from '../store/useLevelUpStore';
import { useAuthStore } from '../store/useAuthStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { pushAnimationEvent } from '../render/animation/animationEvents';
import { resetCooldowns } from '../store/abilityCooldowns';
import { clearFloatingText, spawnFloatingText } from '../store/floatingText';
import { clearSnapshots, recordSnapshots } from '../store/snapshotBuffer';
import { clearDestination } from '../store/destinationState';
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
interface RawState {
  players: { forEach(cb: (player: RawPlayer, key: string) => void): void };
  projectiles: { forEach(cb: (projectile: RawProjectile, key: string) => void): void };
  /** Arena rooms only — interactive barrels (absent in town). */
  barrels?: { forEach(cb: (barrel: RawBarrel, key: string) => void): void };
  /** Arena rooms only — destructible objects (absent in town). */
  destructibles?: { forEach(cb: (d: RawDestructible, key: string) => void): void };
  /** Arena rooms only — HP-bearing cover structures (absent in town). */
  structures?: { forEach(cb: (s: RawStructure, key: string) => void): void };
  tick: number;
  /** Arena rooms only — per-match procedural layout seed (absent in town). */
  layoutSeed?: number;
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
    });
  });

  return { players, projectiles, barrels, destructibles, structures };
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
  ground_slam: { id: 'vfx.ground_slam', at: 'caster', y: 0.06, follow: true },
  // Dash streak: follows the dasher so the swoosh trails their back (the shader
  // fades toward the front, leaving the streak behind), oriented to travel.
  charge: { id: 'vfx.dash', at: 'caster', y: 0, oriented: true, follow: true },
  shield_wall: { id: 'vfx.cast', at: 'caster', y: 0.05, follow: true },
  // Archer
  tumble: { id: 'vfx.dash', at: 'caster', y: 0, oriented: true, follow: true },
  // Priest
  heal: { id: 'vfx.heal', at: 'caster', y: 0.1, follow: true },
  renew: { id: 'vfx.heal', at: 'unit', y: 0.1, follow: true }, // sticks to the healed target
  condemn: { id: 'vfx.condemn', at: 'unit', y: 0 },
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

function onAbilityCast(msg: ServerMessagePayloads[ServerMessage.AbilityCast]): void {
  const spawn = useEffectsStore.getState().spawn;
  const dir: [number, number, number] = [msg.dirX, 0, msg.dirZ];

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
    spawn(burst.id, [x, burst.y, z], burst.oriented ? dir : [0, 0, 1], followId, offset);
    return;
  }

  // Default (projectiles / single-target casts): a quick rune flash at the
  // caster's feet — the projectile itself carries the rest of the visual.
  const def = ABILITIES[msg.ability];
  if (def?.effects[0]?.type === 'aoe' || msg.tx !== undefined) {
    spawn('vfx.arcane_blast', [msg.tx ?? msg.x, 0.05, msg.tz ?? msg.z], [0, 0, 1]);
  } else {
    spawn('vfx.cast', [msg.x, 0.05, msg.z], dir);
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
  useEffectsStore.getState().spawn('vfx.cast', [target.x, 1, target.z], [0, 0, 1]);
  spawnFloatingText(target.x, COMBAT_TEXT_Y, target.z, `-${Math.round(msg.amount)}`, DAMAGE_COLOR);
  // Local flinch is predicted; remote players' hit pose comes from server animState.
  if (!msg.lethal && msg.to === sessionId) pushAnimationEvent(msg.to, 'hit');
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
  disconnectMatchmaking();
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
  // A teleport (portal/scene change) cancels any pending move order — arrive
  // idle and wait for the next command, rather than resuming a stale walk.
  clearDestination();
  joined.onStateChange((state) => {
    try {
      const raw = state as unknown as RawState;
      const { players, projectiles, barrels, destructibles, structures } = snapshotState(raw);
      useGameStore
        .getState()
        .applySnapshot(players, projectiles, barrels, destructibles, structures, raw.tick);
      // Arena rooms sync a layout seed; the scene rebuilds cover from it.
      if (raw.layoutSeed) useGameStore.getState().setArenaSeed(raw.layoutSeed);
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
    // A fiery ground blast + a sharper burst at barrel height.
    useEffectsStore.getState().spawn('vfx.shockwave', [msg.x, 0.05, msg.z]);
    useEffectsStore.getState().spawn('vfx.arcane_blast', [msg.x, 0.8, msg.z]);
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
  joined.onMessage(ServerMessage.CarExplosion, (msg) => {
    // A car detonated: a fireball + ground shock (the server already dealt the
    // 100-damage area blast — this is the explosion VFX).
    useEffectsStore.getState().spawn('vfx.car_explosion', [msg.x, 0, msg.z]);
  });
  joined.onMessage(ServerMessage.Leaderboard, (msg) =>
    useLeaderboardStore.getState().set(msg.enabled, msg.entries),
  );

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
interface RawLobbySlot {
  sessionId: string;
  name: string;
  characterClass: LobbySlotView['characterClass'];
  team: Team;
  index: number;
  accepted: boolean;
}
interface RawLobby {
  id: string;
  name: string;
  mode: LobbyMode;
  status: LobbyStatus;
  hostId: string;
  readyDeadline: number;
  blue: { forEach(cb: (slot: RawLobbySlot) => void): void };
  red: { forEach(cb: (slot: RawLobbySlot) => void): void };
}
interface RawMmState {
  lobbies: { forEach(cb: (lobby: RawLobby, key: string) => void): void };
}

function snapshotSlots(list: { forEach(cb: (slot: RawLobbySlot) => void): void }): LobbySlotView[] {
  const slots: LobbySlotView[] = [];
  list.forEach((slot) =>
    slots.push({
      sessionId: slot.sessionId,
      name: slot.name,
      characterClass: slot.characterClass,
      team: slot.team,
      index: slot.index,
      accepted: slot.accepted,
    }),
  );
  return slots.sort((a, b) => a.index - b.index);
}

function snapshotLobbies(state: RawMmState): LobbyView[] {
  const lobbies: LobbyView[] = [];
  state.lobbies.forEach((lobby) =>
    lobbies.push({
      id: lobby.id,
      name: lobby.name,
      mode: lobby.mode,
      status: lobby.status,
      hostId: lobby.hostId,
      readyDeadline: lobby.readyDeadline,
      blue: snapshotSlots(lobby.blue),
      red: snapshotSlots(lobby.red),
    }),
  );
  return lobbies;
}

function wireMatchmaking(joined: Room): void {
  joined.onStateChange((state) => {
    useLobbyStore.getState().setLobbies(snapshotLobbies(state as unknown as RawMmState));
  });
  joined.onMessage(ServerMessage.MatchFound, (msg) => {
    // Tear down the lobby connection, then consume the seat into the arena.
    disconnectMatchmaking();
    useMatchResultStore.getState().clear();
    void joinByReservation(msg.reservation);
  });
  joined.onMessage(ServerMessage.LobbyError, (msg) => {
    useLobbyStore.getState().setError(msg.message);
  });
  joined.onError((code, message) => {
    console.error(`[mm] room error ${code}: ${message ?? ''}`.trim());
  });
  joined.onLeave(() => {
    if (mmRoom === joined) mmRoom = null;
    useLobbyStore.getState().reset();
  });
}

/** Open the lobby connection (idempotent). Reuses the town join options so the
 *  matchmaking room sees the same account/class as the player's town avatar. */
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
    useLobbyStore.getState().setSession(joined.sessionId);
    wireMatchmaking(joined);
  } catch (err) {
    console.error('[mm] failed to connect to matchmaking:', err);
  }
}

/** Close the lobby connection and clear the lobby UI (no-op if not connected). */
export function disconnectMatchmaking(): void {
  mmGeneration++; // invalidate any in-flight connectMatchmaking
  const current = mmRoom;
  mmRoom = null;
  useLobbyStore.getState().reset();
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
  teardownSession(); // nulls `room`, resets stores → App renders JoinScreen now
  void current.leave().catch(() => {
    /* already gone — the local teardown already returned us to the JoinScreen */
  });
}

/** Join a world for the first time (from the character-select screen). Identity
 *  (token + display name) comes from the signed-in account. */
export async function connectToRoom(
  roomType: RoomType,
  characterClass: CharacterClass,
  skinId?: string,
): Promise<void> {
  const { token, username } = useAuthStore.getState();
  joinOptions = {
    token: token ?? '',
    name: username ?? 'Adventurer',
    characterClass,
    skinId,
    sessionKey: TAB_SESSION,
  };
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
    if (roomType === 'town') void connectMatchmaking();
  } catch (err) {
    room = null;
    const message = err instanceof Error ? err.message : 'Failed to connect';
    store.setStatus('error', message);
    throw err;
  }
}

/** Switch worlds (town ↔ arena) as the same character — used by portals. Keeps
 *  the UI on the game (no flash back to the join screen). */
export async function travelTo(roomType: RoomType): Promise<void> {
  if (!client || !joinOptions || traveling) return;
  const store = useGameStore.getState();
  traveling = true;
  // Cover the world swap with the branded loading screen.
  store.setTransitioning(true, roomType === 'arena' ? 'Entering the arena…' : 'Returning to town…');
  // Matchmaking only exists in town: drop it when leaving for the arena (it's
  // reopened below when arriving in town).
  disconnectMatchmaking();
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
    room = await client.joinOrCreate(ROOM_HANDLER[roomType], joinOptions);
    console.debug(`[travel] join ${roomType} took ${Math.round(performance.now() - t0)}ms`);
    store.setSessionId(room.sessionId);
    store.setRoom(roomType);
    store.setStatus('connected');
    wireRoom(room);
    if (roomType === 'town') void connectMatchmaking();
  } catch (err) {
    room = null;
    store.setStatus('error', err instanceof Error ? err.message : 'Failed to travel');
  } finally {
    traveling = false;
    store.setTransitioning(false);
  }
}

/** Consume a matchmaking seat reservation and enter the dedicated 1v1 arena. */
async function joinByReservation(reservation: unknown): Promise<void> {
  if (!client || traveling) return;
  const store = useGameStore.getState();
  traveling = true;
  store.setTransitioning(true, 'Entering the arena…');
  disconnectMatchmaking(); // belt-and-braces: the match-found handler already did
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
  } catch (err) {
    room = null;
    store.setStatus('error', err instanceof Error ? err.message : 'Failed to join match');
  } finally {
    traveling = false;
    store.setTransitioning(false);
  }
}

// --- Matchmaking intents (sent on the lobby connection) --------------------

/** Create a new lobby of the given mode (the server seats you as host). */
export function sendCreateLobby(name: string, mode: LobbyMode): void {
  mmRoom?.send(ClientMessage.CreateLobby, { name, mode });
}

/** Take a specific team slot in an open lobby. */
export function sendJoinSlot(lobbyId: string, team: Team, index: number): void {
  mmRoom?.send(ClientMessage.JoinSlot, { lobbyId, team, index });
}

/** Leave the lobby you're currently in. */
export function sendLeaveLobby(): void {
  mmRoom?.send(ClientMessage.LeaveLobby, {});
}

/** Accept the ready-check for your full lobby. */
export function sendAcceptMatch(): void {
  mmRoom?.send(ClientMessage.AcceptMatch, {});
}

/** Decline the ready-check (returns the others to the open lobby). */
export function sendDeclineMatch(): void {
  mmRoom?.send(ClientMessage.DeclineMatch, {});
}

/** Play an emote (dance), replicated to everyone in the room. */
export function sendEmote(emote: string): void {
  room?.send(ClientMessage.Emote, { emote });
}

export function requestLeaderboard(): void {
  room?.send(ClientMessage.RequestLeaderboard, {});
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

/** Set the auto-attack target (attack-move toward a player and strike). */
export function sendAttack(targetId: string): void {
  room?.send(ClientMessage.Attack, { targetId });
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

/** Send a global chat message to the current room. */
export function sendChat(text: string): void {
  room?.send(ClientMessage.Chat, { text });
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

/** Toggle the auto-attack feature flag for the current room. */
export function sendSetAutoAttack(enabled: boolean): void {
  room?.send(ClientMessage.SetAutoAttack, { enabled });
}

/** Leave the current room, if any. */
export function disconnect(): void {
  room?.leave(true);
  room = null;
}
