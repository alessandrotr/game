import { QUEUE_BOT_FILL_MS, teamSizeForMode, type LobbyMode, type Team } from '@arena/shared';
import { QueueMember, type MatchmakingState } from '../mmSchema.js';

/** The identity a player brings into matchmaking, carried through to the arena
 *  seat reservation when their queue match starts. */
export interface Identity {
  token: string;
  name: string;
  characterClass: string;
  skinId: string;
  dyeId: string;
  pedestalId: string;
  titleId: string;
  rimId: string;
  weaponId: string;
  enchantId: string;
  /** The tab/session key, carried into the arena seat reservation. */
  sessionKey: string;
}

/** A formed match: the queued humans with their team, plus how many practice
 *  bots fill the remaining slots on each team (0/0 for a full human match). */
export interface MatchPlan {
  mode: LobbyMode;
  humans: { sessionId: string; team: Team }[];
  botFill: { blue: number; red: number };
}

/** A group of queued sessions that must land on the SAME team — a solo queuer
 *  (size 1) or an invited party (size 2). */
interface Group {
  partyId: string;
  sessionIds: string[];
  /** Oldest enqueue time in the group (FIFO ordering). */
  oldest: number;
}

/**
 * The PvP queue state machine: per-session identities + the replicated queue of
 * waiting players, plus the matching logic that forms a match for a format
 * (instantly once both teams can be filled with real players, or with bot-fill
 * once the oldest queuer has waited {@link QUEUE_BOT_FILL_MS}). The room drives it
 * (owns client messaging + the `matchMaker` arena handoff); this stays purely
 * about queue bookkeeping + team assignment.
 */
export class QueueManager {
  private readonly identities = new Map<string, Identity>();

  constructor(private readonly state: MatchmakingState) {}

  // --- Identity ----------------------------------------------------------

  setIdentity(sessionId: string, identity: Identity): void {
    this.identities.set(sessionId, identity);
  }

  identityFor(sessionId: string): Identity | undefined {
    return this.identities.get(sessionId);
  }

  /** Drop a session entirely (its queue entry and its identity). */
  remove(sessionId: string): void {
    this.leave(sessionId);
    this.identities.delete(sessionId);
  }

  // --- Queue mutations ---------------------------------------------------

  /** Queue a session for a format (re-queueing switches format). `partyId` pins
   *  invited duos to the same team; '' for a solo queuer. `townSessionId` lets
   *  peers tell from the paperdoll that this player is already queued. */
  join(sessionId: string, mode: LobbyMode, now: number, partyId = '', townSessionId = ''): void {
    if (!this.identities.has(sessionId)) return;
    const existing = this.state.members.get(sessionId);
    if (existing) {
      existing.mode = mode;
      existing.partyId = partyId;
      existing.enqueuedAt = now;
      if (townSessionId) existing.townSessionId = townSessionId;
      return;
    }
    const member = new QueueMember();
    member.sessionId = sessionId;
    member.townSessionId = townSessionId;
    member.mode = mode;
    member.partyId = partyId;
    member.enqueuedAt = now;
    this.state.members.set(sessionId, member);
  }

  /** Backfill a queued member's town session id once it's known (the town↔mm
   *  presence registration can arrive after the player has already queued). */
  setTownSession(sessionId: string, townSessionId: string): void {
    const member = this.state.members.get(sessionId);
    if (member) member.townSessionId = townSessionId;
  }

  leave(sessionId: string): void {
    this.state.members.delete(sessionId);
  }

  modeFor(sessionId: string): LobbyMode | undefined {
    const m = this.state.members.get(sessionId);
    return m ? (m.mode as LobbyMode) : undefined;
  }

  /** Every distinct format currently being queued for (for the room's tick). */
  activeModes(): LobbyMode[] {
    const modes = new Set<LobbyMode>();
    for (const m of this.state.members.values()) modes.add(m.mode as LobbyMode);
    return [...modes];
  }

  // --- Matching ----------------------------------------------------------

  /**
   * Try to form a match for `mode`. Returns a plan (and removes the chosen
   * players from the queue) when both teams can be filled with real players, or
   * when the oldest queuer has waited past the bot-fill threshold (remaining
   * slots become bots). Returns null while the queue should keep waiting.
   */
  planMatch(mode: LobbyMode, now: number): MatchPlan | null {
    const n = teamSizeForMode(mode);
    const groups = this.groupsFor(mode);
    if (groups.length === 0) return null;

    // Greedy bin-pack groups into two teams of capacity N (blue first). Parties
    // (size 2) stay intact; a group only goes where it fits entirely.
    const blue: string[] = [];
    const red: string[] = [];
    const placedParties: Group[] = [];
    for (const g of groups) {
      if (blue.length + g.sessionIds.length <= n) {
        blue.push(...g.sessionIds);
        placedParties.push(g);
      } else if (red.length + g.sessionIds.length <= n) {
        red.push(...g.sessionIds);
        placedParties.push(g);
      }
    }

    const full = blue.length === n && red.length === n;
    const oldest = Math.min(...groups.map((g) => g.oldest));
    const botFillDue = now - oldest >= QUEUE_BOT_FILL_MS;
    if (!full && !botFillDue) return null;

    // Commit: remove the placed humans from the queue.
    const humans: { sessionId: string; team: Team }[] = [
      ...blue.map((sessionId) => ({ sessionId, team: 'blue' as Team })),
      ...red.map((sessionId) => ({ sessionId, team: 'red' as Team })),
    ];
    for (const h of humans) this.leave(h.sessionId);

    return {
      mode,
      humans,
      botFill: { blue: n - blue.length, red: n - red.length },
    };
  }

  /** Groups of same-party (or solo) members for a format, in FIFO order. */
  private groupsFor(mode: LobbyMode): Group[] {
    const byParty = new Map<string, Group>();
    const solos: Group[] = [];
    for (const m of this.state.members.values()) {
      if (m.mode !== mode) continue;
      if (m.partyId) {
        const g = byParty.get(m.partyId);
        if (g) {
          g.sessionIds.push(m.sessionId);
          g.oldest = Math.min(g.oldest, m.enqueuedAt);
        } else {
          byParty.set(m.partyId, {
            partyId: m.partyId,
            sessionIds: [m.sessionId],
            oldest: m.enqueuedAt,
          });
        }
      } else {
        solos.push({ partyId: '', sessionIds: [m.sessionId], oldest: m.enqueuedAt });
      }
    }
    return [...byParty.values(), ...solos].sort((a, b) => a.oldest - b.oldest);
  }
}
