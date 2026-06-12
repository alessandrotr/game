import type { Client } from '@colyseus/core';
import { SESSION_SUPERSEDED_CODE } from '@arena/shared';

/**
 * Single-session enforcement ("newest wins"). One account legitimately holds
 * several simultaneous connections — the town room and the matchmaking room run
 * in parallel, and a match arena is a third — so we can't cap connections per
 * account. Instead each browser tab sends a stable `sessionKey`; all of a tab's
 * connections share it. When a connection arrives for an account under a *new*
 * sessionKey, the previous tab's connections are superseded and disconnected.
 *
 * Single-process / in-memory: fine for one Colyseus node (the deployment today).
 * Multi-process would need a shared (e.g. Redis) registry + cross-node kicks.
 */

/** Close code sent to a connection that a newer session superseded. */
export const SESSION_SUPERSEDED = SESSION_SUPERSEDED_CODE;

interface AccountSessions {
  /** The tab/session currently allowed to be online for this account. */
  sessionKey: string;
  /** Every live connection (town / arena / matchmaking) for that session. */
  clients: Set<Client>;
}

const byPid = new Map<number, AccountSessions>();
const pidByClient = new WeakMap<Client, number>();

/**
 * Record a connection for an account. Returns the connections that a newer
 * session has now superseded — the caller should disconnect each (they belong to
 * the account's previous tab). An empty array means no conflict (first session,
 * or another connection of the same tab).
 */
export function registerSession(pid: number, sessionKey: string, client: Client): Client[] {
  pidByClient.set(client, pid);
  const existing = byPid.get(pid);
  if (!existing) {
    byPid.set(pid, { sessionKey, clients: new Set([client]) });
    return [];
  }
  if (existing.sessionKey === sessionKey) {
    existing.clients.add(client);
    return [];
  }
  // A different tab/session — supersede the old one.
  const superseded = [...existing.clients];
  byPid.set(pid, { sessionKey, clients: new Set([client]) });
  return superseded;
}

/** Drop a connection from its account's session registry (call on every leave). */
export function unregisterSession(client: Client): void {
  const pid = pidByClient.get(client);
  if (pid === undefined) return;
  pidByClient.delete(client);
  const existing = byPid.get(pid);
  if (!existing) return;
  existing.clients.delete(client);
  if (existing.clients.size === 0) byPid.delete(pid);
}
