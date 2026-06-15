import { type Client } from '@colyseus/core';
import {
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
  type CharacterClass,
} from '@arena/shared';
import { ArenaState, Player } from './schema.js';
import { AvatarRoom } from './AvatarRoom.js';
import { reviveFull } from '../combat.js';
import { ChatLog } from '../chat.js';
import { getPool } from '../db/database.js';
import { findGuestId, getProgress, topPlayers } from '../db/players.js';
import {
  resolveClass,
  resolveDyeId,
  resolveName,
  resolvePedestalId,
  resolveRimId,
  resolveSkinId,
  resolveTitleId,
  type JoinOptions,
} from './util/identity.js';
import { applyGravity, stepMove } from './util/locomotion.js';
import { captureServerError, captureTickError, userFromClaims } from '../observability.js';
import { verifyToken, type TokenClaims } from '../auth.js';

/** Where players appear when entering town (matches the town map's spawn zone). */
const TOWN_SPAWN = { x: 0, z: 12 };

/**
 * The town hub (Phase 10.1): a shared, **non-combat** space. Players walk around
 * (point-and-click), see each other, and chat globally. It reuses the arena's
 * `Player`/`ArenaState` schema and movement feel (via {@link AvatarRoom}), minus
 * all combat — so the client renders town players exactly like arena players.
 */
export class TownRoom extends AvatarRoom {
  override maxClients = MAX_PLAYERS;

  // Town is the persistent shared channel — its chat is saved to the DB so it
  // survives the room being disposed when empty (and server restarts).
  protected override readonly chat = new ChatLog({ channel: 'town' });

  protected override readonly halfLimit = TOWN_HALF_SIZE - PLAYER_RADIUS;

  protected override jumpForce(): number {
    return JUMP_FORCE;
  }

  /** Town is non-combat: players are always alive and may always act. */
  protected override canControl(): boolean {
    return true;
  }

  override async onCreate(): Promise<void> {
    // Restore the persisted town chat before anyone joins, so the first joiner
    // sees the saved history rather than an empty log.
    await this.chat.load();
    this.setState(new ArenaState());

    this.registerAvatarHandlers();

    this.onMessage(ClientMessage.RequestLeaderboard, (client) => {
      const db = getPool();
      if (!db) {
        client.send(ServerMessage.Leaderboard, { enabled: false, entries: [] });
        return;
      }
      void topPlayers(db, 20)
        .then((entries) => client.send(ServerMessage.Leaderboard, { enabled: true, entries }))
        .catch((err) => {
          captureServerError(err, {
            message: '[town] leaderboard query failed:',
            tags: { where: 'town.leaderboard', roomId: this.roomId, sessionId: client.sessionId },
          });
          client.send(ServerMessage.Leaderboard, { enabled: true, entries: [] });
        });
    });

    // Town has no combat/tuning, but accept (and ignore) these so a stray dev
    // message never triggers Colyseus's unhandled-message disconnect (code 4002).
    this.onMessage(ClientMessage.DevTune, () => {});
    this.onMessage(ClientMessage.AbilityTune, () => {});
    this.onMessage(ClientMessage.CastAbility, () => {});
    this.onMessage(ClientMessage.Attack, () => {});

    // Swallow + capture a thrown tick rather than crashing the whole process.
    this.setSimulationInterval((deltaMs) => {
      try {
        this.update(deltaMs);
      } catch (err) {
        captureTickError(this.roomId, err, { where: 'town.tick', roomId: this.roomId });
      }
    }, TICK_MS);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    try {
      this.setupTownJoin(client, options);
    } catch (err) {
      captureServerError(err, {
        message: '[town] onJoin failed:',
        tags: { where: 'town.onJoin', roomId: this.roomId, sessionId: client.sessionId },
        user: userFromClaims(verifyToken(options?.token)),
      });
      throw err; // re-throw so Colyseus rejects the seat (client sees a join error)
    }
  }

  private setupTownJoin(client: Client, options?: JoinOptions): void {
    const claims = this.enforceSingleSession(client, options);

    const player = new Player();
    player.sessionId = client.sessionId;
    player.name = resolveName(claims, options);
    player.characterClass = resolveClass(options);
    player.skinId = resolveSkinId(options);
    player.dyeId = resolveDyeId(options);
    player.pedestalId = resolvePedestalId(options);
    player.titleId = resolveTitleId(options);
    player.rimId = resolveRimId(options);
    // Seed max HP/mana from the class so the floating bar (and its chunk ticks)
    // looks identical to the arena, even though town is non-combat.
    const stats = getClassDefinition(player.characterClass as CharacterClass).stats;
    player.maxHp = stats.health;
    player.maxMana = stats.mana;
    player.x = TOWN_SPAWN.x + (Math.random() * 2 - 1) * 2;
    player.z = TOWN_SPAWN.z + (Math.random() * 2 - 1) * 2;
    player.y = GROUND_Y;
    reviveFull(player);

    this.state.players.set(client.sessionId, player);
    this.verticalVelocity.set(client.sessionId, 0);
    this.grounded.set(client.sessionId, true);

    this.sendWelcome(client);

    // Show the account's persisted progression for this class in town too (the
    // HUD reads level/xp/kills/deaths). Town is non-combat, so this is display
    // only — nothing here mutates or saves it.
    void this.loadProgress(client.sessionId, claims, player.characterClass);
  }

  /** Seed the replicated career totals from the DB so the town HUD isn't 1/0/0.
   *  For a guest this is read-only — it shows progress only if their row already
   *  exists (from a prior match) and never creates one (that happens in the arena). */
  private async loadProgress(
    sessionId: string,
    claims: TokenClaims | null,
    characterClass: string,
  ): Promise<void> {
    const db = getPool();
    if (!db || !claims) return;
    let playerId = claims.pid;
    if (playerId === undefined && claims.guest && claims.gid) {
      playerId = (await findGuestId(db, claims.gid)) ?? undefined;
    }
    if (playerId === undefined) return;
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

  protected override removeClient(client: Client): void {
    this.baseRemove(client.sessionId);
    this.unregisterSession(client);
  }

  private update(deltaMs: number): void {
    this.simTime += deltaMs;
    const dt = deltaMs / 1000;
    const limit = this.halfLimit;

    this.state.players.forEach((player, sessionId) => {
      const startX = player.x;
      const startZ = player.z;

      // Point-and-click movement via the shared deterministic step, at the
      // player's per-class move speed.
      const arrived = stepMove(
        player,
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
      if (arrived) this.destinations.delete(sessionId);

      // Vertical movement (gravity + jump).
      const g = applyGravity(player, this.verticalVelocity.get(sessionId) ?? 0, dt);
      this.verticalVelocity.set(sessionId, g.vy);
      if (g.grounded) this.grounded.set(sessionId, true);

      // Locomotion + emotes (no combat poses in town). A dance plays until it
      // expires or the player moves.
      const moving = Math.hypot(player.x - startX, player.z - startZ) > 0.01;
      this.resolveAvatarAnim(player, sessionId, moving);
    });

    this.state.tick++;
  }
}
