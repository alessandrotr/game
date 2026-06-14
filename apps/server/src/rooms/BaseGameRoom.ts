import { Room, type Client } from '@colyseus/core';
import { verifyToken, type TokenClaims } from '../auth.js';
import {
  findRoomDuplicates,
  registerSession,
  tagClientAccount,
  unregisterSession,
  SESSION_SUPERSEDED,
} from '../sessions.js';
import { sessionKeyOf, type JoinOptions } from './util/identity.js';

/**
 * The common lifecycle every room shares: single-session enforcement on join and
 * idempotent cleanup on leave. Each room implements {@link removeClient} (the
 * cleanup differs — players + combat state for the arena, lobby presence for
 * matchmaking) and {@link BaseGameRoom} drives it from both the duplicate
 * eviction path and {@link onLeave}.
 */
export abstract class BaseGameRoom<TState extends object> extends Room<TState> {
  /**
   * Single-session ("newest wins") enforcement, shared by every room's `onJoin`.
   * Tags the client with its account, supersedes the account's previous tab
   * (closing its sockets), and evicts any duplicate of this account already in
   * the room (a second tab or a same-tab reconnect whose stale socket lingers).
   * Returns the token claims so the caller can read `pid` / `name`.
   */
  protected enforceSingleSession(client: Client, options?: JoinOptions): TokenClaims | null {
    const claims = verifyToken(options?.token);
    // Registered accounts bind immediately. Guests have no account id until their
    // row is created on first match — the arena binds them then (see ArenaRoom).
    if (claims?.pid !== undefined) this.bindAccountSession(client, claims.pid, options);
    return claims;
  }

  /**
   * Bind a connection to its account for single-session enforcement: tag it,
   * supersede the account's previous tab (closing its sockets), and evict any
   * duplicate of this account already in the room. Called for registered
   * accounts on join, and for a guest once their row is resolved on first match.
   */
  protected bindAccountSession(client: Client, pid: number, options?: JoinOptions): void {
    tagClientAccount(client, pid);
    // Cross-tab supersede (other rooms too): close the previous tab's sockets.
    for (const stale of registerSession(pid, sessionKeyOf(options), client)) {
      stale.leave(SESSION_SUPERSEDED);
    }
    // In-room duplicate: tear down its presence NOW (no lingering ghost), close it.
    for (const dupe of findRoomDuplicates(this, pid, client)) {
      this.removeClient(dupe);
      dupe.leave(SESSION_SUPERSEDED);
    }
  }

  override onLeave(client: Client): void {
    this.removeClient(client);
  }

  /** Tear down a client's presence. Must be idempotent — it runs both when a
   *  duplicate session is evicted on join and again when the socket closes. */
  protected abstract removeClient(client: Client): void;

  /** Drop a client from its account's session registry. Call from `removeClient`. */
  protected unregisterSession(client: Client): void {
    unregisterSession(client);
  }

  /** Find a connected client by its session id. */
  protected clientFor(sessionId: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === sessionId);
  }
}
