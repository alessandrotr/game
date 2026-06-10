import { Room, type Client } from '@colyseus/core';
import {
  CLICK_ROTATION_SPEED,
  CLICK_SPRINT_THRESHOLD,
  CLICK_STOPPING_DISTANCE,
  GRAVITY,
  GROUND_Y,
  JUMP_FORCE,
  MAX_PLAYERS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SPRINT_SPEED,
  TICK_MS,
  TOWN_HALF_SIZE,
  ClientMessage,
  ServerMessage,
  isCharacterClass,
} from '@arena/shared';
import { ArenaState, Player } from './schema.js';
import { reviveFull } from '../combat.js';
import { computeAnimState } from '../animation.js';
import { ChatLog } from '../chat.js';

const MAX_NAME_LENGTH = 24;
/** Where players appear when entering town (matches the town map's spawn zone). */
const TOWN_SPAWN = { x: 0, z: 12 };

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Interpolate an angle along the shortest path, handling the ±π wrap. */
function lerpAngle(a: number, b: number, t: number): number {
  const tau = Math.PI * 2;
  const diff = ((((b - a) % tau) + tau + Math.PI) % tau) - Math.PI;
  return a + diff * t;
}

/**
 * The town hub (Phase 10.1): a shared, **non-combat** space. Players walk around
 * (point-and-click), see each other, and chat globally. It reuses the arena's
 * `Player`/`ArenaState` schema and movement feel, minus all combat — so the
 * client renders town players exactly like arena players.
 */
export class TownRoom extends Room<ArenaState> {
  override maxClients = MAX_PLAYERS;

  private readonly destinations = new Map<string, { x: number; z: number; sprint: boolean }>();
  private readonly verticalVelocity = new Map<string, number>();
  private readonly grounded = new Map<string, boolean>();
  private readonly chat = new ChatLog();
  private simTime = 0;

  override onCreate(): void {
    this.setState(new ArenaState());

    this.onMessage<{ x: number; z: number }>(ClientMessage.MoveTo, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const limit = TOWN_HALF_SIZE - PLAYER_RADIUS;
      const x = Number.isFinite(message?.x) ? clamp(message.x, -limit, limit) : player.x;
      const z = Number.isFinite(message?.z) ? clamp(message.z, -limit, limit) : player.z;
      const sprint = Math.hypot(x - player.x, z - player.z) > CLICK_SPRINT_THRESHOLD;
      this.destinations.set(client.sessionId, { x, z, sprint });
    });

    this.onMessage(ClientMessage.StopMove, (client) => {
      this.destinations.delete(client.sessionId);
    });

    this.onMessage(ClientMessage.Jump, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (this.grounded.get(client.sessionId)) {
        this.verticalVelocity.set(client.sessionId, JUMP_FORCE);
        this.grounded.set(client.sessionId, false);
      }
    });

    this.onMessage<{ name: string }>(ClientMessage.SetName, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const name = String(message?.name ?? '')
        .trim()
        .slice(0, MAX_NAME_LENGTH);
      if (name.length > 0) player.name = name;
    });

    this.onMessage<{ text: string }>(ClientMessage.Chat, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      this.chat.handle(this, player?.name ?? 'Adventurer', message?.text);
    });

    // Town has no combat/tuning, but accept (and ignore) these so a stray dev
    // message never triggers Colyseus's unhandled-message disconnect (code 4002).
    this.onMessage(ClientMessage.DevTune, () => {});
    this.onMessage(ClientMessage.AbilityTune, () => {});
    this.onMessage(ClientMessage.CastAbility, () => {});
    this.onMessage(ClientMessage.Attack, () => {});

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), TICK_MS);
  }

  override onJoin(
    client: Client,
    options?: { name?: string; characterClass?: string; skinId?: string },
  ): void {
    const player = new Player();
    player.sessionId = client.sessionId;
    player.name = (options?.name ?? '').trim().slice(0, MAX_NAME_LENGTH) || 'Adventurer';
    player.characterClass = isCharacterClass(options?.characterClass)
      ? options.characterClass
      : 'warrior';
    player.skinId = String(options?.skinId ?? '').slice(0, 64);
    player.x = TOWN_SPAWN.x + (Math.random() * 2 - 1) * 2;
    player.z = TOWN_SPAWN.z + (Math.random() * 2 - 1) * 2;
    player.y = GROUND_Y;
    reviveFull(player);

    this.state.players.set(client.sessionId, player);
    this.verticalVelocity.set(client.sessionId, 0);
    this.grounded.set(client.sessionId, true);

    client.send(ServerMessage.Welcome, { sessionId: client.sessionId, worldSeed: this.roomId.length });
    this.chat.sendHistory(client);
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.destinations.delete(client.sessionId);
    this.verticalVelocity.delete(client.sessionId);
    this.grounded.delete(client.sessionId);
  }

  private update(deltaMs: number): void {
    this.simTime += deltaMs;
    const dt = deltaMs / 1000;
    const limit = TOWN_HALF_SIZE - PLAYER_RADIUS;

    this.state.players.forEach((player, sessionId) => {
      const startX = player.x;
      const startZ = player.z;

      // Point-and-click movement toward the active destination, if any.
      const dest = this.destinations.get(sessionId);
      if (dest) {
        const dx = dest.x - player.x;
        const dz = dest.z - player.z;
        const distance = Math.hypot(dx, dz);
        const remaining = distance - CLICK_STOPPING_DISTANCE;
        if (remaining > 0.02) {
          const ndx = dx / distance;
          const ndz = dz / distance;
          const speed = dest.sprint ? SPRINT_SPEED : PLAYER_SPEED;
          const step = Math.min(speed * dt, remaining);
          player.x = clamp(player.x + ndx * step, -limit, limit);
          player.z = clamp(player.z + ndz * step, -limit, limit);
          const face = Math.atan2(ndx, ndz);
          player.rotation = lerpAngle(player.rotation, face, 1 - Math.exp(-CLICK_ROTATION_SPEED * dt));
        } else {
          this.destinations.delete(sessionId);
        }
      }

      // Vertical movement (gravity + jump).
      let vy = this.verticalVelocity.get(sessionId) ?? 0;
      vy -= GRAVITY * dt;
      player.y += vy * dt;
      if (player.y <= GROUND_Y) {
        player.y = GROUND_Y;
        vy = 0;
        this.grounded.set(sessionId, true);
      }
      this.verticalVelocity.set(sessionId, vy);

      // Locomotion-only animation (no combat poses in town).
      const moving = Math.hypot(player.x - startX, player.z - startZ) > 0.01;
      player.animState = computeAnimState({ alive: true, moving, oneShot: null, now: this.simTime });
    });

    this.state.tick++;
  }
}
