import { Room, matchMaker, type Client } from '@colyseus/core';
import {
  ARENA_ROOM,
  EMOTE_MS,
  GRAVITY,
  GROUND_Y,
  JUMP_FORCE,
  MAX_PLAYERS,
  MOVEMENT,
  PLAYER_RADIUS,
  TICK_MS,
  TOWN_HALF_SIZE,
  TOWN_OBSTACLES,
  ClientMessage,
  ServerMessage,
  getClassDefinition,
  isCharacterClass,
  isEmote,
  stepLocomotion,
  type CharacterClass,
} from '@arena/shared';
import { ArenaState, Player } from './schema.js';
import { reviveFull } from '../combat.js';
import { computeAnimState, type AnimOneShot } from '../animation.js';
import { ChatLog } from '../chat.js';
import { getPool } from '../db/database.js';
import { getProgress, topPlayers } from '../db/players.js';
import { verifyToken } from '../auth.js';

const MAX_NAME_LENGTH = 24;
/** Where players appear when entering town (matches the town map's spawn zone). */
const TOWN_SPAWN = { x: 0, z: 12 };

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * The town hub (Phase 10.1): a shared, **non-combat** space. Players walk around
 * (point-and-click), see each other, and chat globally. It reuses the arena's
 * `Player`/`ArenaState` schema and movement feel, minus all combat — so the
 * client renders town players exactly like arena players.
 */
export class TownRoom extends Room<ArenaState> {
  override maxClients = MAX_PLAYERS;

  private readonly destinations = new Map<string, { x: number; z: number }>();
  private readonly verticalVelocity = new Map<string, number>();
  private readonly grounded = new Map<string, boolean>();
  // Town is the persistent shared channel — its chat is saved to the DB so it
  // survives the room being disposed when empty (and server restarts).
  private readonly chat = new ChatLog({ channel: 'town' });
  /** Device id per session, carried into the match arena's seat reservation. */
  /** Session token per client, passed through to the arena seat reservation. */
  private readonly tokens = new Map<string, string>();
  /** Active emote (dance) per player; cleared on movement or when it expires. */
  private readonly animOneShots = new Map<string, AnimOneShot>();
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
      this.destinations.set(client.sessionId, { x, z });
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

    this.onMessage<{ emote: string }>(ClientMessage.Emote, (client, message) => {
      if (!isEmote(message?.emote)) return;
      this.animOneShots.set(client.sessionId, {
        name: message.emote,
        until: this.simTime + EMOTE_MS,
      });
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
    this.animOneShots.delete(client.sessionId);
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

      // Point-and-click movement via the shared deterministic step (same code
      // the client predictor runs), at the player's per-class move speed.
      const result = stepLocomotion(
        { x: player.x, z: player.z, rotation: player.rotation },
        this.destinations.get(sessionId) ?? null,
        {
          speed: getClassDefinition(player.characterClass as CharacterClass).stats.moveSpeed,
          rotationSpeed: MOVEMENT.rotationSpeed,
          stoppingDistance: MOVEMENT.stoppingDistance,
          halfBounds: limit,
          obstacles: TOWN_OBSTACLES,
        },
        dt,
      );
      player.x = result.x;
      player.z = result.z;
      player.rotation = result.rotation;
      if (result.arrived) this.destinations.delete(sessionId);

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

      // Locomotion + emotes (no combat poses in town). A dance plays until it
      // expires or the player moves.
      const moving = Math.hypot(player.x - startX, player.z - startZ) > 0.01;
      let oneShot = this.animOneShots.get(sessionId) ?? null;
      if (oneShot && (moving || this.simTime >= oneShot.until)) {
        this.animOneShots.delete(sessionId);
        oneShot = null;
      }
      player.animState = computeAnimState({
        alive: true,
        moving,
        oneShot,
        now: this.simTime,
      });
    });

    this.state.tick++;
  }
}
