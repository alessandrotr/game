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
    if (claims?.pid !== undefined) {
      tagClientAccount(client, claims.pid);
      // Cross-tab supersede (other rooms too): close the previous tab's sockets.
      for (const stale of registerSession(claims.pid, sessionKeyOf(options), client)) {
        stale.leave(SESSION_SUPERSEDED);
      }
      // In-room duplicate: tear down its presence NOW (no lingering ghost), close it.
      for (const dupe of findRoomDuplicates(this, claims.pid, client)) {
        this.removeClient(dupe);
        dupe.leave(SESSION_SUPERSEDED);
      }
    }
    return claims;
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
