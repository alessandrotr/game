import { Client, type Room } from 'colyseus.js';
import {
  ABILITIES,
  ARENA_ROOM,
  MATCHMAKING_ROOM,
  TOWN_ROOM,
  ClientMessage,
  ServerMessage,
  type AbilityKind,
  type CharacterClass,
  type ClientMessagePayloads,
  type LobbyMode,
  type LobbySlotView,
  type LobbyStatus,
  type LobbyView,
  type PlayerView,
  type ProjectileView,
  type ServerMessagePayloads,
  type Team,
} from '@arena/shared';
import { useGameStore, type RoomType } from '../store/useGameStore';
import { useChatStore } from '../store/useChatStore';
import { useSpeechStore } from '../store/useSpeechStore';
import { useLobbyStore } from '../store/useLobbyStore';
import { useMatchResultStore } from '../store/useMatchResultStore';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { useLevelUpStore } from '../store/useLevelUpStore';
import { useAuthStore } from '../store/useAuthStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { pushAnimationEvent } from '../render/animation/animationEvents';
import { resetCooldowns } from '../store/abilityCooldowns';
import { clearFloatingText, spawnFloatingText } from '../store/floatingText';
import { clearSnapshots, recordSnapshots } from '../store/snapshotBuffer';
import { clearDestination } from '../store/destinationState';

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
interface RawState {
  players: { forEach(cb: (player: RawPlayer, key: string) => void): void };
  projectiles: { forEach(cb: (projectile: RawProjectile, key: string) => void): void };
  tick: number;
}

// Strip any trailing slash so the Colyseus client builds clean URLs even if
// VITE_SERVER_URL is configured with one.
const ENDPOINT = (import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567').replace(/\/+$/, '');

let client: Client | null = null;
let room: Room | null = null;

function snapshotState(state: RawState): {
  players: Map<string, PlayerView>;
  projectiles: Map<string, ProjectileView>;
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
      alive: player.alive,
      characterClass: player.characterClass,
      skinId: player.skinId,
      animState: player.animState,
      attackTargetId: player.attackTargetId,
      level: player.level,
      xp: player.xp,
      kills: player.kills,
      deaths: player.deaths,
      team: player.team,
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

  return { players, projectiles };
}

/** Map an ability cast event to a transient client-side VFX + a character
 *  animation event for the caster (so local and remote players animate alike). */
function onAbilityCast(msg: ServerMessagePayloads[ServerMessage.AbilityCast]): void {
  const spawn = useEffectsStore.getState().spawn;
  switch (msg.ability) {
    case 'fireball':
      // The traveling projectile is replicated; show a muzzle flash at the caster.
      spawn('vfx.cast', [msg.x, msg.y, msg.z], [msg.dirX, 0, msg.dirZ]);
      break;
    case 'heal':
      spawn('vfx.heal', [msg.x, 0.1, msg.z], [0, 0, 1]);
      break;
    case 'arcane_bolt':
      // Long-range bolt: replicated projectile + a muzzle flash at the caster.
      spawn('vfx.cast', [msg.x, msg.y, msg.z], [msg.dirX, 0, msg.dirZ]);
      break;
    case 'shockwave':
      spawn('vfx.shockwave', [msg.x, 0.2, msg.z], [0, 0, 1]);
      break;
    case 'frost_nova':
      spawn('vfx.frost', [msg.x, 0.2, msg.z], [0, 0, 1]);
      break;
    case 'arcane_blast': {
      // Burst at the server-resolved impact point (the clicked target).
      const tx = msg.tx ?? msg.x + msg.dirX * ABILITIES.arcane_blast.range;
      const tz = msg.tz ?? msg.z + msg.dirZ * ABILITIES.arcane_blast.range;
      spawn('vfx.arcane_blast', [tx, 0.4, tz], [0, 0, 1]);
      break;
    }
  }
  // Cast/attack poses are server-authoritative (replicated via `animState`) for
  // remote players; the local caster predicts its own in the ability hotkey.
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
} | null = null;
/** True while intentionally switching rooms, so `onLeave` doesn't reset to the
 *  join screen. */
let traveling = false;

/** Wire a freshly-joined room's state + messages into the stores. */
function wireRoom(joined: Room): void {
  clearSnapshots(); // fresh interpolation timeline per room (no cross-room bleed)
  // A teleport (portal/scene change) cancels any pending move order — arrive
  // idle and wait for the next command, rather than resuming a stale walk.
  clearDestination();
  joined.onStateChange((state) => {
    const raw = state as unknown as RawState;
    const { players, projectiles } = snapshotState(raw);
    useGameStore.getState().applySnapshot(players, projectiles, raw.tick);
    // Feed the interpolation buffer used to render remote players smoothly.
    recordSnapshots(players, performance.now());
  });

  // Identity is read from `room.sessionId`; the Welcome message is acknowledged
  // here only so colyseus.js doesn't warn about an unhandled type.
  joined.onMessage(ServerMessage.Welcome, () => {});

  // Combat events only fire in the arena; harmless to listen for everywhere.
  joined.onMessage(ServerMessage.AbilityCast, onAbilityCast);
  joined.onMessage(ServerMessage.Damage, onDamage);
  joined.onMessage(ServerMessage.Heal, onHeal);
  joined.onMessage(ServerMessage.LevelUp, onLevelUp);
  joined.onMessage(ServerMessage.Chat, (msg) => {
    useChatStore.getState().add(msg);
    if (msg.senderId) useSpeechStore.getState().say(msg.senderId, msg.text);
  });
  joined.onMessage(ServerMessage.ChatHistory, (msg) => useChatStore.getState().set(msg.messages));

  // Matchmaking lives on a separate connection (see wireMatchmaking); the town
  // gameplay room only carries world state + combat/chat events.
  joined.onMessage(ServerMessage.MatchOver, (msg) => useMatchResultStore.getState().set(msg));
  joined.onMessage(ServerMessage.Leaderboard, (msg) =>
    useLeaderboardStore.getState().set(msg.enabled, msg.entries),
  );

  joined.onError((code, message) => {
    useGameStore.getState().setStatus('error', `Room error ${code}: ${message ?? ''}`.trim());
  });

  joined.onLeave(() => {
    if (traveling) return; // an intentional room switch — keep playing
    room = null;
    disconnectMatchmaking(); // drop the parallel lobby connection too
    useGameStore.getState().reset();
    useChatStore.getState().clear();
  useSpeechStore.getState().clear();
  useMatchResultStore.getState().clear();
  });
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

/** Leave the current room and return to the character-select screen (staying
 *  signed in). The room's `onLeave` resets the game store, so the app falls back
 *  to the JoinScreen. Used by the town's "Change Character" control. */
export async function leaveToCharacterSelect(): Promise<void> {
  const current = room;
  if (!current) return;
  disconnectMatchmaking();
  try {
    await current.leave();
  } catch {
    /* already gone — onLeave will have cleaned up */
  }
}

/** Join a world for the first time (from the character-select screen). Identity
 *  (token + display name) comes from the signed-in account. */
export async function connectToRoom(
  roomType: RoomType,
  characterClass: CharacterClass,
  skinId?: string,
): Promise<void> {
  const { token, username } = useAuthStore.getState();
  joinOptions = { token: token ?? '', name: username ?? 'Adventurer', characterClass, skinId };
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
  // Matchmaking only exists in town: drop it when leaving for the arena (it's
  // reopened below when arriving in town).
  disconnectMatchmaking();
  try {
    // Leave the old world without blocking — leaving and joining are independent
    // rooms, so awaiting the close handshake just adds a round-trip to the swap
    // (noticeable on a high-latency host). `traveling` keeps its onLeave from
    // resetting us to the join screen.
    if (room) {
      const previous = room;
      room = null;
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

    room = await client.joinOrCreate(ROOM_HANDLER[roomType], joinOptions);
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
  }
}

/** Consume a matchmaking seat reservation and enter the dedicated 1v1 arena. */
async function joinByReservation(reservation: unknown): Promise<void> {
  if (!client || traveling) return;
  const store = useGameStore.getState();
  traveling = true;
  disconnectMatchmaking(); // belt-and-braces: the match-found handler already did
  try {
    // Non-blocking leave (see travelTo): don't wait out the close handshake
    // before consuming the seat into the arena.
    if (room) {
      const previous = room;
      room = null;
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
    room = await client.consumeSeatReservation(reservation as never);
    store.setSessionId(room.sessionId);
    store.setRoom('arena');
    store.setStatus('connected');
    wireRoom(room);
  } catch (err) {
    room = null;
    store.setStatus('error', err instanceof Error ? err.message : 'Failed to join match');
  } finally {
    traveling = false;
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

/** Request to cast an ability in a direction (with an optional ground target). */
export function sendCast(
  ability: AbilityKind,
  dirX: number,
  dirZ: number,
  tx?: number,
  tz?: number,
): void {
  room?.send(ClientMessage.CastAbility, { ability, dirX, dirZ, tx, tz });
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

/** Leave the current room, if any. */
export function disconnect(): void {
  room?.leave(true);
  room = null;
}
