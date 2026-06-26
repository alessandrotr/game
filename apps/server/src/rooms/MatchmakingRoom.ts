import { matchMaker, type Client } from '@colyseus/core';
import {
  ARENA_ROOM,
  ClientMessage,
  ServerMessage,
  isLobbyMode,
  teamSizeForMode,
  type LobbyMode,
  type Team,
} from '@arena/shared';
import { MatchmakingState } from './mmSchema.js';
import { BaseGameRoom } from './BaseGameRoom.js';
import {
  resolveClass,
  resolveDyeId,
  resolveName,
  resolvePedestalId,
  resolveRimId,
  resolveSkinId,
  resolveTitleId,
  resolveWeaponId,
  resolveEnchantId,
  sessionKeyOf,
  type JoinOptions,
} from './util/identity.js';
import { QueueManager, type MatchPlan } from './matchmaking/queue.js';
import { captureServerError, userFromClaims } from '../observability.js';
import { verifyToken } from '../auth.js';

/** A pending player-to-player invite, awaiting the target's accept/decline. */
interface PendingInvite {
  fromMm: string;
  toMm: string;
  mode: LobbyMode;
  expiresAt: number;
}

/** How long an unanswered invite lingers before it expires (ms). */
const INVITE_TTL_MS = 30000;

/**
 * The singleton PvP matchmaking room. It owns a replicated per-format QUEUE: a
 * client clicks a format, joins that queue, and is dropped into a private
 * {@link ArenaRoom} the moment the queue can field two full teams (or, after
 * {@link QUEUE_BOT_FILL_MS}, with practice bots filling the gaps). It also relays
 * direct player-to-player invites (from the paperdoll): a 1v1 invite spins up an
 * immediate duel, a team-format invite queues the two together as a same-team
 * party. The queue/team bookkeeping lives in {@link QueueManager}; this room
 * validates intents, messages clients, and drives the `matchMaker` arena handoff.
 *
 * Single-process / `LocalPresence` is assumed: every town client `joinOrCreate`s
 * this handler and funnels into one instance, so the queue is globally shared.
 */
export class MatchmakingRoom extends BaseGameRoom<MatchmakingState> {
  private queue!: QueueManager;
  /** Serializes async arena creation across all matches (one at a time). */
  private matching = false;
  /** Maps so an invite can target a player by their TOWN session id (the only id
   *  the inviting client has from the paperdoll). Registered via MmRegisterTown. */
  private readonly townToMm = new Map<string, string>();
  private readonly mmToTown = new Map<string, string>();
  private readonly pendingInvites = new Map<string, PendingInvite>();
  private inviteSeq = 0;

  override onCreate(): void {
    this.autoDispose = false; // keep the queue warm even when empty
    this.setState(new MatchmakingState());
    this.queue = new QueueManager(this.state);

    this.onMessage<{ mode?: string }>(ClientMessage.JoinQueue, (client, message) =>
      this.handleJoinQueue(client, message),
    );
    this.onMessage(ClientMessage.LeaveQueue, (client) => this.queue.leave(client.sessionId));
    this.onMessage<{ townSessionId?: string }>(ClientMessage.MmRegisterTown, (client, message) =>
      this.registerTown(client, message),
    );
    this.onMessage<{ targetSessionId?: string; mode?: string }>(
      ClientMessage.InviteToMatch,
      (client, message) => this.handleInvite(client, message),
    );
    this.onMessage<{ inviteId?: string; accept?: boolean }>(
      ClientMessage.InviteRespond,
      (client, message) => this.handleInviteRespond(client, message),
    );

    // 1 Hz: form ready queues, fill stale ones with bots, expire dead invites.
    this.setSimulationInterval(() => void this.tick(), 1000);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    try {
      this.setupMatchmakingJoin(client, options);
    } catch (err) {
      captureServerError(err, {
        message: '[matchmaking] onJoin failed:',
        tags: { where: 'matchmaking.onJoin', roomId: this.roomId, sessionId: client.sessionId },
        user: userFromClaims(verifyToken(options?.token)),
      });
      throw err; // re-throw so Colyseus rejects the seat (client sees a join error)
    }
  }

  private setupMatchmakingJoin(client: Client, options?: JoinOptions): void {
    const claims = this.enforceSingleSession(client, options);
    const characterClass = resolveClass(options);
    this.queue.setIdentity(client.sessionId, {
      token: String(options?.token ?? ''),
      name: resolveName(claims, options),
      characterClass,
      skinId: resolveSkinId(options),
      dyeId: resolveDyeId(options),
      pedestalId: resolvePedestalId(options),
      titleId: resolveTitleId(options),
      rimId: resolveRimId(options),
      weaponId: resolveWeaponId(options, characterClass),
      enchantId: resolveEnchantId(options, characterClass),
      sessionKey: sessionKeyOf(options),
    });
  }

  /** Tear down a client's matchmaking presence. Idempotent. */
  protected override removeClient(client: Client): void {
    const sessionId = client.sessionId;
    this.queue.remove(sessionId);
    const town = this.mmToTown.get(sessionId);
    if (town !== undefined) {
      this.townToMm.delete(town);
      this.mmToTown.delete(sessionId);
    }
    // Drop any invites this player was part of.
    for (const [id, inv] of this.pendingInvites) {
      if (inv.fromMm === sessionId || inv.toMm === sessionId) this.pendingInvites.delete(id);
    }
    this.unregisterSession(client);
  }

  // --- Intents -----------------------------------------------------------

  private handleJoinQueue(client: Client, message: { mode?: string }): void {
    if (!this.queue.identityFor(client.sessionId)) return;
    if (!isLobbyMode(message?.mode)) {
      this.fail(client, 'bad_mode', 'Pick a valid match size.');
      return;
    }
    this.queue.join(client.sessionId, message.mode, Date.now(), '', this.mmToTown.get(client.sessionId) ?? '');
    void this.tryForm(message.mode);
  }

  private registerTown(client: Client, message: { townSessionId?: string }): void {
    const town = String(message?.townSessionId ?? '');
    if (!town) return;
    // Clear a prior mapping for this mm session (a re-register after re-join).
    const prevTown = this.mmToTown.get(client.sessionId);
    if (prevTown !== undefined && prevTown !== town) this.townToMm.delete(prevTown);
    this.townToMm.set(town, client.sessionId);
    this.mmToTown.set(client.sessionId, town);
    // If they queued before registering, backfill so peers can see them as busy.
    this.queue.setTownSession(client.sessionId, town);
  }

  private handleInvite(client: Client, message: { targetSessionId?: string; mode?: string }): void {
    if (!this.queue.identityFor(client.sessionId)) return;
    if (!isLobbyMode(message?.mode)) {
      this.fail(client, 'bad_mode', 'Pick a valid match size.');
      return;
    }
    const targetMm = this.townToMm.get(String(message?.targetSessionId ?? ''));
    if (!targetMm || targetMm === client.sessionId) {
      this.fail(client, 'unavailable', 'That player is not available to invite.');
      return;
    }
    const inviteId = `inv_${++this.inviteSeq}`;
    this.pendingInvites.set(inviteId, {
      fromMm: client.sessionId,
      toMm: targetMm,
      mode: message.mode,
      expiresAt: Date.now() + INVITE_TTL_MS,
    });
    const fromName = this.queue.identityFor(client.sessionId)?.name ?? 'Someone';
    this.clientFor(targetMm)?.send(ServerMessage.MatchInvite, {
      inviteId,
      fromName,
      mode: message.mode,
    });
  }

  private handleInviteRespond(client: Client, message: { inviteId?: string; accept?: boolean }): void {
    const inviteId = String(message?.inviteId ?? '');
    const invite = this.pendingInvites.get(inviteId);
    if (!invite || invite.toMm !== client.sessionId) return;
    this.pendingInvites.delete(inviteId);
    const inviter = this.clientFor(invite.fromMm);
    if (!message?.accept) {
      const who = this.queue.identityFor(invite.toMm)?.name ?? 'They';
      this.fail(inviter, 'invite_declined', `${who} declined your invite.`);
      return;
    }
    // Both must still be connected with a known identity.
    if (!inviter || !this.queue.identityFor(invite.fromMm) || !this.queue.identityFor(invite.toMm)) {
      this.fail(this.clientFor(invite.toMm), 'unavailable', 'That player is no longer available.');
      return;
    }
    if (teamSizeForMode(invite.mode) === 1) {
      // 1v1: an immediate private duel — the two on opposite teams, no queue.
      void this.startMatch({
        mode: invite.mode,
        humans: [
          { sessionId: invite.fromMm, team: 'blue' as Team },
          { sessionId: invite.toMm, team: 'red' as Team },
        ],
        botFill: { blue: 0, red: 0 },
      });
    } else {
      // Team format: queue both together as a same-team party; matching fills the rest.
      const now = Date.now();
      this.queue.join(invite.fromMm, invite.mode, now, inviteId, this.mmToTown.get(invite.fromMm) ?? '');
      this.queue.join(invite.toMm, invite.mode, now, inviteId, this.mmToTown.get(invite.toMm) ?? '');
      void this.tryForm(invite.mode);
    }
  }

  // --- Match formation + cleanup -----------------------------------------

  /** Try to form a match for `mode`; if a plan is ready, start it. */
  private async tryForm(mode: LobbyMode): Promise<void> {
    if (this.matching) return;
    const plan = this.queue.planMatch(mode, Date.now());
    if (plan) await this.startMatch(plan);
  }

  /**
   * Create the arena and hand each human a seat reservation; practice bots fill
   * the remaining slots (passed to ArenaRoom via the `botFill` option). Serialized
   * by `matching` so concurrent forms can't double-create.
   */
  private async startMatch(plan: MatchPlan): Promise<void> {
    if (this.matching) return;
    this.matching = true;
    try {
      const room = await matchMaker.createRoom(ARENA_ROOM, {
        mode: plan.mode,
        botFill: plan.botFill,
      });
      const seats: { sessionId: string; reservation: unknown }[] = [];
      for (const human of plan.humans) {
        const identity = this.queue.identityFor(human.sessionId);
        if (!identity) continue;
        const reservation = await matchMaker.reserveSeatFor(room, {
          token: identity.token,
          name: identity.name,
          characterClass: identity.characterClass,
          skinId: identity.skinId,
          dyeId: identity.dyeId,
          pedestalId: identity.pedestalId,
          titleId: identity.titleId,
          rimId: identity.rimId,
          weaponId: identity.weaponId,
          enchantId: identity.enchantId,
          team: human.team,
          sessionKey: identity.sessionKey,
        });
        seats.push({ sessionId: human.sessionId, reservation });
      }
      for (const seat of seats) {
        this.clientFor(seat.sessionId)?.send(ServerMessage.MatchFound, {
          reservation: seat.reservation,
        });
      }
    } catch (err) {
      captureServerError(err, {
        message: '[matchmaking] failed to start match:',
        tags: { where: 'matchmaking.startMatch', roomId: this.roomId },
        extra: { mode: plan.mode },
      });
      // Re-queue the humans so they aren't silently dropped.
      const now = Date.now();
      for (const human of plan.humans) {
        this.queue.join(human.sessionId, plan.mode, now);
        this.fail(this.clientFor(human.sessionId), 'start_failed', 'Could not start the match.');
      }
    } finally {
      this.matching = false;
    }
  }

  /** Per-second housekeeping: form/bot-fill each active queue, expire invites. */
  private async tick(): Promise<void> {
    const now = Date.now();
    for (const [id, inv] of this.pendingInvites) {
      if (now > inv.expiresAt) this.pendingInvites.delete(id);
    }
    if (this.matching) return;
    for (const mode of this.queue.activeModes()) {
      const plan = this.queue.planMatch(mode, now);
      if (plan) {
        await this.startMatch(plan);
        return; // one match per tick keeps the async create serialized
      }
    }
  }

  // --- Helpers -----------------------------------------------------------

  private fail(client: Client | undefined, code: string, message: string): void {
    client?.send(ServerMessage.LobbyError, { code, message });
  }
}
