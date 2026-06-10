import { Client, type Room } from 'colyseus.js';
import {
  ABILITIES,
  ARENA_ROOM,
  ClientMessage,
  ServerMessage,
  type AbilityKind,
  type CharacterClass,
  type ClientMessagePayloads,
  type PlayerView,
  type ProjectileView,
  type ServerMessagePayloads,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { pushAnimationEvent } from '../render/animation/animationEvents';
import { resetCooldowns } from '../store/abilityCooldowns';
import { clearFloatingText, spawnFloatingText } from '../store/floatingText';

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
    case 'charge':
      spawn('vfx.cast', [msg.x, 0.6, msg.z], [msg.dirX, 0, msg.dirZ]);
      break;
    case 'frost_nova':
      spawn('vfx.frost', [msg.x, 0.2, msg.z], [0, 0, 1]);
      break;
    case 'blink': {
      // Flash at the origin and again where the caster reappears.
      const dist = ABILITIES.blink.range;
      spawn('vfx.blink', [msg.x, 0.8, msg.z], [0, 0, 1]);
      spawn('vfx.blink', [msg.x + msg.dirX * dist, 0.8, msg.z + msg.dirZ * dist], [0, 0, 1]);
      break;
    }
    case 'meteor': {
      // Telegraph the impact point now; the blast lands after the wind-up. The
      // server applies the damage authoritatively at the same moment.
      const meteor = ABILITIES.meteor;
      const tx = msg.x + msg.dirX * meteor.range;
      const tz = msg.z + msg.dirZ * meteor.range;
      spawn('vfx.meteor_telegraph', [tx, 0, tz], [0, 0, 1]);
      window.setTimeout(() => spawn('vfx.meteor', [tx, 0.3, tz], [0, 0, 1]), meteor.castTimeMs);
      break;
    }
  }
  // `charge` is an attack lunge; the rest are spellcasts. Drives the state machine.
  pushAnimationEvent(msg.casterId, msg.ability === 'charge' ? 'attack' : 'cast');
}

/** Show a hit spark + damage number at the damaged player, and play a flinch.
 *  Death isn't an event — the state machine latches it from the replicated
 *  `alive` flag — so a lethal blow skips the flinch and goes to the death pose. */
function onDamage(msg: ServerMessagePayloads[ServerMessage.Damage]): void {
  const target = useGameStore.getState().players.get(msg.to);
  if (!target) return;
  useEffectsStore.getState().spawn('vfx.cast', [target.x, 1, target.z], [0, 0, 1]);
  spawnFloatingText(target.x, COMBAT_TEXT_Y, target.z, `-${Math.round(msg.amount)}`, DAMAGE_COLOR);
  if (!msg.lethal) pushAnimationEvent(msg.to, 'hit');
}

/** Show a healing number above the healed player. */
function onHeal(msg: ServerMessagePayloads[ServerMessage.Heal]): void {
  const target = useGameStore.getState().players.get(msg.to);
  if (!target) return;
  spawnFloatingText(target.x, COMBAT_TEXT_Y, target.z, `+${Math.round(msg.amount)}`, HEAL_COLOR);
}

/** Join (or create) an arena room and wire its state into the store. */
export async function connectToArena(
  name: string,
  characterClass: CharacterClass,
  skinId?: string,
): Promise<void> {
  const store = useGameStore.getState();
  store.reset();
  resetCooldowns();
  clearFloatingText();
  store.setStatus('connecting');

  try {
    client ??= new Client(ENDPOINT);
    room = await client.joinOrCreate(ARENA_ROOM, { name, characterClass, skinId });

    store.setSessionId(room.sessionId);
    store.setStatus('connected');

    room.onStateChange((state) => {
      const raw = state as unknown as RawState;
      const { players, projectiles } = snapshotState(raw);
      useGameStore.getState().applySnapshot(players, projectiles, raw.tick);
    });

    room.onMessage(ServerMessage.AbilityCast, onAbilityCast);
    room.onMessage(ServerMessage.Damage, onDamage);
    room.onMessage(ServerMessage.Heal, onHeal);

    room.onError((code, message) => {
      useGameStore.getState().setStatus('error', `Room error ${code}: ${message ?? ''}`.trim());
    });

    room.onLeave(() => {
      room = null;
      useGameStore.getState().reset();
    });
  } catch (err) {
    room = null;
    const message = err instanceof Error ? err.message : 'Failed to connect';
    store.setStatus('error', message);
    throw err;
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

/** Request to cast an ability in a direction. */
export function sendCast(ability: AbilityKind, dirX: number, dirZ: number): void {
  room?.send(ClientMessage.CastAbility, { ability, dirX, dirZ });
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
