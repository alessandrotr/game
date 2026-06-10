import { Client, type Room } from 'colyseus.js';
import {
  ABILITIES,
  ARENA_ROOM,
  TOWN_ROOM,
  ClientMessage,
  ServerMessage,
  type AbilityKind,
  type CharacterClass,
  type ClientMessagePayloads,
  type PlayerView,
  type ProjectileView,
  type ServerMessagePayloads,
} from '@arena/shared';
import { useGameStore, type RoomType } from '../store/useGameStore';
import { useChatStore } from '../store/useChatStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { pushAnimationEvent } from '../render/animation/animationEvents';
import { resetCooldowns } from '../store/abilityCooldowns';
import { clearFloatingText, spawnFloatingText } from '../store/floatingText';

/** Colyseus handler name for each world. */
const ROOM_HANDLER: Record<RoomType, string> = { town: TOWN_ROOM, arena: ARENA_ROOM };

/** World height above a player's feet where combat numbers appear. */
const COMBAT_TEXT_Y = 2.1;
const DAMAGE_COLOR = '#ff5a5a';
const HEAL_COLOR = '#7cff9e';

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

const ENDPOINT = import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567';

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

/** Options from the join screen, kept so portal travel can re-join as the same
 *  character without re-prompting. */
let joinOptions: { name: string; characterClass: CharacterClass; skinId?: string } | null = null;
/** True while intentionally switching rooms, so `onLeave` doesn't reset to the
 *  join screen. */
let traveling = false;

/** Wire a freshly-joined room's state + messages into the stores. */
function wireRoom(joined: Room): void {
  joined.onStateChange((state) => {
    const raw = state as unknown as RawState;
    const { players, projectiles } = snapshotState(raw);
    useGameStore.getState().applySnapshot(players, projectiles, raw.tick);
  });

  // Identity is read from `room.sessionId`; the Welcome message is acknowledged
  // here only so colyseus.js doesn't warn about an unhandled type.
  joined.onMessage(ServerMessage.Welcome, () => {});

  // Combat events only fire in the arena; harmless to listen for everywhere.
  joined.onMessage(ServerMessage.AbilityCast, onAbilityCast);
  joined.onMessage(ServerMessage.Damage, onDamage);
  joined.onMessage(ServerMessage.Heal, onHeal);
  joined.onMessage(ServerMessage.Chat, (msg) => useChatStore.getState().add(msg));
  joined.onMessage(ServerMessage.ChatHistory, (msg) => useChatStore.getState().set(msg.messages));

  joined.onError((code, message) => {
    useGameStore.getState().setStatus('error', `Room error ${code}: ${message ?? ''}`.trim());
  });

  joined.onLeave(() => {
    if (traveling) return; // an intentional room switch — keep playing
    room = null;
    useGameStore.getState().reset();
    useChatStore.getState().clear();
  });
}

/** Join a world for the first time (from the join screen). */
export async function connectToRoom(
  roomType: RoomType,
  name: string,
  characterClass: CharacterClass,
  skinId?: string,
): Promise<void> {
  joinOptions = { name, characterClass, skinId };
  const store = useGameStore.getState();
  store.reset();
  resetCooldowns();
  clearFloatingText();
  useChatStore.getState().clear();
  store.setStatus('connecting');

  try {
    client ??= new Client(ENDPOINT);
    room = await client.joinOrCreate(ROOM_HANDLER[roomType], joinOptions);
    store.setSessionId(room.sessionId);
    store.setRoom(roomType);
    store.setStatus('connected');
    wireRoom(room);
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
  try {
    if (room) {
      try {
        await room.leave();
      } catch {
        /* ignore */
      }
      room = null;
    }
    // Clear the old world's transient state; stay 'connected' so the scene stays up.
    store.players.clear();
    store.projectiles.clear();
    resetCooldowns();
    clearFloatingText();
    useChatStore.getState().clear();

    room = await client.joinOrCreate(ROOM_HANDLER[roomType], joinOptions);
    store.setSessionId(room.sessionId);
    store.setRoom(roomType);
    store.setStatus('connected');
    wireRoom(room);
  } catch (err) {
    room = null;
    store.setStatus('error', err instanceof Error ? err.message : 'Failed to travel');
  } finally {
    traveling = false;
  }
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

/** Leave the current room, if any. */
export function disconnect(): void {
  room?.leave(true);
  room = null;
}
