import { Room, matchMaker, type Client } from '@colyseus/core';
import {
  ARENA_ROOM,
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
  collideTownObstacles,
  isCharacterClass,
} from '@arena/shared';
import { ArenaState, Player } from './schema.js';
import { reviveFull } from '../combat.js';
import { computeAnimState } from '../animation.js';
import { ChatLog } from '../chat.js';
import { getPool } from '../db/database.js';
import { getProgress, topPlayers } from '../db/players.js';
import { verifyToken } from '../auth.js';

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
  // Town is the persistent shared channel — its chat is saved to the DB so it
  // survives the room being disposed when empty (and server restarts).
  private readonly chat = new ChatLog({ channel: 'town' });
  /** Device id per session, carried into the match arena's seat reservation. */
  /** Session token per client, passed through to the arena seat reservation. */
  private readonly tokens = new Map<string, string>();
  /** Session ids waiting in the 1v1 matchmaking queue, in join order. */
  private queue: string[] = [];
  private matching = false;
  private simTime = 0;

  override async onCreate(): Promise<void> {
    // Restore the persisted town chat before anyone joins, so the first joiner
    // sees the saved history rather than an empty log.
    await this.chat.load();
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
      this.chat.handle(this, client.sessionId, player?.name ?? 'Adventurer', message?.text);
    });

    this.onMessage(ClientMessage.Queue, (client) => {
      if (!this.queue.includes(client.sessionId)) this.queue.push(client.sessionId);
      this.sendQueueUpdate(client, true);
      void this.tryMatch();
    });

    this.onMessage(ClientMessage.Unqueue, (client) => {
      this.removeFromQueue(client.sessionId);
      this.sendQueueUpdate(client, false);
    });

    this.onMessage(ClientMessage.RequestLeaderboard, (client) => {
      const db = getPool();
      if (!db) {
        client.send(ServerMessage.Leaderboard, { enabled: false, entries: [] });
        return;
      }
      void topPlayers(db, 20)
        .then((entries) => client.send(ServerMessage.Leaderboard, { enabled: true, entries }))
        .catch((err) => {
          console.error('[town] leaderboard query failed:', err);
          client.send(ServerMessage.Leaderboard, { enabled: true, entries: [] });
        });
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
    options?: { token?: string; name?: string; characterClass?: string; skinId?: string },
  ): void {
    const claims = verifyToken(options?.token);
    const player = new Player();
    player.sessionId = client.sessionId;
    // The display name is taken from the (authoritative) account token; fall
    // back to the client-supplied name only for unauthenticated/ephemeral joins.
    player.name =
      claims?.name?.slice(0, MAX_NAME_LENGTH) ||
      (options?.name ?? '').trim().slice(0, MAX_NAME_LENGTH) ||
      'Adventurer';
    player.characterClass = isCharacterClass(options?.characterClass)
      ? options.characterClass
      : 'warrior';
    player.skinId = String(options?.skinId ?? '').slice(0, 64);
    player.x = TOWN_SPAWN.x + (Math.random() * 2 - 1) * 2;
    player.z = TOWN_SPAWN.z + (Math.random() * 2 - 1) * 2;
    player.y = GROUND_Y;
    reviveFull(player);

    // Keep the token so matchmaking can hand the same identity to the arena.
    this.tokens.set(client.sessionId, String(options?.token ?? ''));

    this.state.players.set(client.sessionId, player);
    this.verticalVelocity.set(client.sessionId, 0);
    this.grounded.set(client.sessionId, true);

    client.send(ServerMessage.Welcome, { sessionId: client.sessionId, worldSeed: this.roomId.length });
    this.chat.sendHistory(client);

    // Show the account's persisted progression for this class in town too (the
    // HUD reads level/xp/kills/deaths). Town is non-combat, so this is display
    // only — nothing here mutates or saves it.
    void this.loadProgress(client.sessionId, claims?.pid, player.characterClass);
  }

  /** Seed the replicated career totals from the DB so the town HUD isn't 1/0/0. */
  private async loadProgress(
    sessionId: string,
    playerId: number | undefined,
    characterClass: string,
  ): Promise<void> {
    const db = getPool();
    if (!db || playerId === undefined) return;
    try {
      const progress = await getProgress(db, playerId, characterClass);
      const player = this.state.players.get(sessionId);
      if (!player) return; // left before the load finished
      player.level = progress.level;
      player.xp = progress.xp;
      player.kills = progress.kills;
      player.deaths = progress.deaths;
    } catch (err) {
      console.error('[town] failed to load progress:', err);
    }
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.destinations.delete(client.sessionId);
    this.verticalVelocity.delete(client.sessionId);
    this.grounded.delete(client.sessionId);
    this.tokens.delete(client.sessionId);
    this.removeFromQueue(client.sessionId);
    this.chat.forget(client.sessionId);
  }

  // --- Matchmaking (Phase 11) --------------------------------------------

  private removeFromQueue(sessionId: string): void {
    this.queue = this.queue.filter((id) => id !== sessionId);
  }

  private sendQueueUpdate(client: Client, searching: boolean): void {
    client.send(ServerMessage.QueueUpdate, { searching, size: this.queue.length });
  }

  /**
   * Pair queued players into private 1v1 arenas. Pops two at a time, creates a
   * dedicated match room, reserves a seat for each, and hands the reservations
   * back so the clients consume them and auto-join the same arena.
   */
  private async tryMatch(): Promise<void> {
    if (this.matching) return; // serialize async room creation
    this.matching = true;
    try {
      while (this.queue.length >= 2) {
        const aId = this.queue.shift()!;
        const bId = this.queue.shift()!;
        const a = this.clients.find((c) => c.sessionId === aId);
        const b = this.clients.find((c) => c.sessionId === bId);
        // Drop anyone who vanished; requeue the survivor.
        if (!a || !this.state.players.has(aId)) {
          if (b && this.state.players.has(bId)) this.queue.unshift(bId);
          continue;
        }
        if (!b || !this.state.players.has(bId)) {
          this.queue.unshift(aId);
          break;
        }

        try {
          const room = await matchMaker.createRoom(ARENA_ROOM, { match: true });
          const seatA = await matchMaker.reserveSeatFor(room, this.joinOptions(aId));
          const seatB = await matchMaker.reserveSeatFor(room, this.joinOptions(bId));
          a.send(ServerMessage.MatchFound, { reservation: seatA });
          b.send(ServerMessage.MatchFound, { reservation: seatB });
        } catch (err) {
          // Room creation failed — put both back and stop trying this pass.
          this.queue.unshift(bId, aId);
          console.error('[town] matchmaking failed:', err);
          break;
        }
      }
    } finally {
      this.matching = false;
    }
  }

  /** Arena join options carried into the match room for a queued player. */
  private joinOptions(sessionId: string): {
    token: string;
    name: string;
    characterClass: string;
    skinId: string;
  } {
    const p = this.state.players.get(sessionId);
    return {
      token: this.tokens.get(sessionId) ?? '',
      name: p?.name ?? 'Adventurer',
      characterClass: p?.characterClass ?? 'warrior',
      skinId: p?.skinId ?? '',
    };
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
          // Collide with town props (buildings, walls, well, …).
          const fixed = collideTownObstacles(player.x, player.z);
          player.x = fixed.x;
          player.z = fixed.z;
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
      const sprinting = this.destinations.get(sessionId)?.sprint ?? false;
      player.animState = computeAnimState({
        alive: true,
        moving,
        sprinting,
        oneShot: null,
        now: this.simTime,
      });
    });

    this.state.tick++;
  }
}
