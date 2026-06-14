import { matchMaker, type Client } from '@colyseus/core';
import {
  LOBBY_NAME_MAX_LENGTH,
  MAX_LOBBIES,
  ZOMBIE_COOP_MAX_PLAYERS,
  ZOMBIE_LOBBY_CODE_ALPHABET,
  ZOMBIE_LOBBY_CODE_LENGTH,
  ZOMBIE_MODE,
  ZOMBIE_ROOM,
  ClientMessage,
  ServerMessage,
} from '@arena/shared';
import { ZombieLobby, ZombieLobbySlot, ZombieMatchmakingState } from './zombieMmSchema.js';
import { BaseGameRoom } from './BaseGameRoom.js';
import {
  resolveClass,
  resolveDyeId,
  resolveName,
  resolvePedestalId,
  resolveSkinId,
  resolveTitleId,
  sessionKeyOf,
  type JoinOptions,
} from './util/identity.js';
import type { Identity } from './matchmaking/lobbies.js';
import { captureServerError, userFromClaims } from '../observability.js';
import { verifyToken } from '../auth.js';

/**
 * The singleton co-op Zombie matchmaking room. Mirrors {@link MatchmakingRoom} but
 * for a single shared squad (up to {@link ZOMBIE_COOP_MAX_PLAYERS}) instead of two
 * teams: rooms are public (listed in the browser) or private (hidden, joined by a
 * share code), and the host launches the run whenever ready (1–5 players). On start
 * it spins up a private co-op {@link ArenaRoom} (the {@link ZOMBIE_ROOM} handler)
 * and hands every member a seat reservation.
 *
 * Single-process / `LocalPresence` is assumed: every client `joinOrCreate`s this
 * handler and funnels into one instance, so the lobby list is globally shared.
 */
export class ZombieMatchmakingRoom extends BaseGameRoom<ZombieMatchmakingState> {
  /** Per-session identity, captured on join and used to issue reservations. */
  private readonly identities = new Map<string, Identity>();
  /** Which lobby each session currently occupies (at most one). */
  private readonly membership = new Map<string, string>();
  private lobbySeq = 0;
  /** Serializes async room creation across all lobbies (one at a time). */
  private matching = false;
  /** Guards the room-liveness poll so a slow query can't stack. */
  private polling = false;

  override onCreate(): void {
    this.autoDispose = false; // keep the lobby registry warm even when empty
    this.setState(new ZombieMatchmakingState());

    this.onMessage<{ name?: string; isPrivate?: boolean }>(
      ClientMessage.ZombieCreateLobby,
      (client, message) => this.handleCreate(client, message),
    );
    this.onMessage<{ lobbyId?: string }>(ClientMessage.ZombieJoinLobby, (client, message) =>
      this.handleJoin(client, this.state.lobbies.get(String(message?.lobbyId ?? ''))),
    );
    this.onMessage<{ code?: string }>(ClientMessage.ZombieJoinByCode, (client, message) =>
      this.handleJoinByCode(client, String(message?.code ?? '')),
    );
    this.onMessage(ClientMessage.ZombieLeaveLobby, (client) =>
      this.removePlayerFromLobby(client.sessionId),
    );
    this.onMessage(ClientMessage.ZombieStartMatch, (client) => this.handleStart(client));

    // 1 Hz cleanup: drop lobbies whose co-op room has ended.
    this.setSimulationInterval(() => void this.cleanupFinishedLobbies(), 1000);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    try {
      const claims = this.enforceSingleSession(client, options);
      this.identities.set(client.sessionId, {
        token: String(options?.token ?? ''),
        name: resolveName(claims, options),
        characterClass: resolveClass(options),
        skinId: resolveSkinId(options),
        dyeId: resolveDyeId(options),
        pedestalId: resolvePedestalId(options),
        titleId: resolveTitleId(options),
        sessionKey: sessionKeyOf(options),
      });
    } catch (err) {
      captureServerError(err, {
        message: '[zombie-mm] onJoin failed:',
        tags: { where: 'zombieMm.onJoin', roomId: this.roomId, sessionId: client.sessionId },
        user: userFromClaims(verifyToken(options?.token)),
      });
      throw err; // re-throw so Colyseus rejects the seat
    }
  }

  protected override removeClient(client: Client): void {
    this.removePlayerFromLobby(client.sessionId);
    this.identities.delete(client.sessionId);
    this.unregisterSession(client);
  }

  // --- Intents -----------------------------------------------------------

  private handleCreate(client: Client, message: { name?: string; isPrivate?: boolean }): void {
    if (!this.identities.has(client.sessionId)) return;
    const name = String(message?.name ?? '')
      .trim()
      .slice(0, LOBBY_NAME_MAX_LENGTH);
    if (name.length === 0) {
      this.fail(client, 'bad_name', 'Give your squad a name.');
      return;
    }
    if (this.state.lobbies.size >= MAX_LOBBIES) {
      this.fail(client, 'too_many', 'Too many open squads right now. Try again shortly.');
      return;
    }

    // Auto-move: drop the player from any lobby they're already in.
    this.removePlayerFromLobby(client.sessionId);

    const lobby = new ZombieLobby();
    lobby.id = `zlobby_${++this.lobbySeq}`;
    lobby.name = name;
    lobby.hostId = client.sessionId;
    lobby.isPrivate = !!message?.isPrivate;
    lobby.code = lobby.isPrivate ? this.uniqueCode() : '';
    lobby.status = 'queuing';
    this.seat(lobby, client.sessionId);
    this.membership.set(client.sessionId, lobby.id);
    this.state.lobbies.set(lobby.id, lobby);
  }

  private handleJoin(client: Client, lobby: ZombieLobby | undefined): void {
    if (!this.identities.has(client.sessionId)) return;
    // Browser join is for PUBLIC lobbies only; private ones join via code.
    if (!lobby || lobby.isPrivate) {
      this.fail(client, 'unavailable', 'That squad is no longer open.');
      return;
    }
    this.joinLobby(client, lobby);
  }

  private handleJoinByCode(client: Client, rawCode: string): void {
    if (!this.identities.has(client.sessionId)) return;
    const code = rawCode.trim().toUpperCase();
    if (code.length === 0) {
      this.fail(client, 'bad_code', 'Enter a squad code.');
      return;
    }
    const lobby = [...this.state.lobbies.values()].find((l) => l.code === code);
    if (!lobby) {
      this.fail(client, 'no_code', 'No squad found with that code.');
      return;
    }
    this.joinLobby(client, lobby);
  }

  /** Shared join path (public-by-id or private-by-code): validate capacity/status
   *  and seat the player, first dropping any lobby they're already in. */
  private joinLobby(client: Client, lobby: ZombieLobby): void {
    if (lobby.status !== 'queuing') {
      this.fail(client, 'unavailable', 'That run has already started.');
      return;
    }
    if (lobby.members.length >= ZOMBIE_COOP_MAX_PLAYERS) {
      this.fail(client, 'full', 'That squad is full.');
      return;
    }
    if (this.membership.get(client.sessionId) === lobby.id) return; // already in it
    this.removePlayerFromLobby(client.sessionId);
    this.seat(lobby, client.sessionId);
    this.membership.set(client.sessionId, lobby.id);
  }

  private handleStart(client: Client): void {
    const lobby = this.lobbyFor(client.sessionId);
    if (!lobby || lobby.status !== 'queuing') return;
    if (lobby.hostId !== client.sessionId) {
      this.fail(client, 'not_host', 'Only the host can start the run.');
      return;
    }
    if (lobby.members.length === 0) return;
    void this.startMatch(lobby);
  }

  // --- Match start + cleanup ---------------------------------------------

  /** Create the co-op zombie room and hand every member a seat reservation. */
  private async startMatch(lobby: ZombieLobby): Promise<void> {
    if (this.matching || lobby.status !== 'queuing') return;
    this.matching = true;
    lobby.status = 'playing';
    try {
      // A dedicated, PRIVATE co-op zombie room (only reachable via reservation, so
      // random travellers can't drop in). `coop` flips final-death + game-over on.
      const room = await matchMaker.createRoom(ZOMBIE_ROOM, { mode: ZOMBIE_MODE, coop: true });
      const seats: { sessionId: string; reservation: unknown }[] = [];
      for (const member of this.membersOf(lobby)) {
        const identity = this.identities.get(member.sessionId);
        const reservation = await matchMaker.reserveSeatFor(room, {
          token: identity?.token ?? '',
          name: member.name,
          characterClass: member.characterClass,
          skinId: identity?.skinId ?? '',
          dyeId: identity?.dyeId ?? '',
          pedestalId: identity?.pedestalId ?? '',
          titleId: identity?.titleId ?? '',
          team: 'blue', // co-op: one squad, all on blue
          sessionKey: identity?.sessionKey ?? '',
        });
        seats.push({ sessionId: member.sessionId, reservation });
      }
      lobby.roomId = room.roomId;
      for (const seat of seats) {
        this.clientFor(seat.sessionId)?.send(ServerMessage.MatchFound, {
          reservation: seat.reservation,
        });
      }
    } catch (err) {
      captureServerError(err, {
        message: '[zombie-mm] failed to start run:',
        tags: { where: 'zombieMm.startMatch', roomId: this.roomId },
        extra: { lobbyId: lobby.id },
      });
      lobby.status = 'queuing';
      lobby.roomId = '';
      for (const member of this.membersOf(lobby)) {
        this.fail(this.clientFor(member.sessionId), 'start_failed', 'Could not start the run.');
      }
    } finally {
      this.matching = false;
    }
  }

  /** Drop any `playing` lobby whose co-op room no longer exists (the run ended). */
  private async cleanupFinishedLobbies(): Promise<void> {
    if (this.polling) return;
    const playing = [...this.state.lobbies.values()].filter(
      (l) => l.status === 'playing' && l.roomId,
    );
    if (playing.length === 0) return;
    this.polling = true;
    try {
      for (const lobby of playing) {
        const rooms = await matchMaker.query({ roomId: lobby.roomId });
        if (rooms.length === 0) this.state.lobbies.delete(lobby.id);
      }
    } catch (err) {
      captureServerError(err, {
        message: '[zombie-mm] room cleanup query failed:',
        tags: { where: 'zombieMm.cleanup', roomId: this.roomId },
      });
    } finally {
      this.polling = false;
    }
  }

  // --- Lobby bookkeeping -------------------------------------------------

  private lobbyFor(sessionId: string): ZombieLobby | undefined {
    const lobbyId = this.membership.get(sessionId);
    return lobbyId ? this.state.lobbies.get(lobbyId) : undefined;
  }

  /** A lobby's members as a clean array (ArraySchema spreads as possibly-undefined). */
  private membersOf(lobby: ZombieLobby): ZombieLobbySlot[] {
    return [...lobby.members].filter((m): m is ZombieLobbySlot => m !== undefined);
  }

  /** Append a member seat for `sessionId` (no-op without a captured identity). */
  private seat(lobby: ZombieLobby, sessionId: string): void {
    const identity = this.identities.get(sessionId);
    if (!identity) return;
    const slot = new ZombieLobbySlot();
    slot.sessionId = sessionId;
    slot.name = identity.name;
    slot.characterClass = identity.characterClass;
    slot.index = lobby.members.length;
    lobby.members.push(slot);
  }

  /**
   * Remove a player from whatever lobby they occupy: dispose an empty lobby,
   * reassign the host, and re-index the remaining members. A no-op while the lobby
   * is `playing` (its members stay for the browser/cleanup until the run ends).
   */
  private removePlayerFromLobby(sessionId: string): void {
    const lobbyId = this.membership.get(sessionId);
    if (!lobbyId) return;
    this.membership.delete(sessionId);
    const lobby = this.state.lobbies.get(lobbyId);
    if (!lobby || lobby.status === 'playing') return;

    const idx = lobby.members.findIndex((m) => m.sessionId === sessionId);
    if (idx >= 0) lobby.members.splice(idx, 1);

    if (lobby.members.length === 0) {
      this.state.lobbies.delete(lobbyId);
      return;
    }
    lobby.members.forEach((m, i) => (m.index = i)); // keep join order contiguous
    if (lobby.hostId === sessionId) lobby.hostId = lobby.members[0]?.sessionId ?? '';
  }

  /** A code not currently in use by any lobby. */
  private uniqueCode(): string {
    const taken = new Set([...this.state.lobbies.values()].map((l) => l.code));
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < ZOMBIE_LOBBY_CODE_LENGTH; i++) {
        code += ZOMBIE_LOBBY_CODE_ALPHABET.charAt(
          Math.floor(Math.random() * ZOMBIE_LOBBY_CODE_ALPHABET.length),
        );
      }
      if (!taken.has(code)) return code;
    }
    // Astronomically unlikely fallback (50 collisions); append a digit to be safe.
    return `${this.lobbySeq}`.padStart(ZOMBIE_LOBBY_CODE_LENGTH, '0');
  }

  private fail(client: Client | undefined, code: string, message: string): void {
    client?.send(ServerMessage.LobbyError, { code, message });
  }
}
