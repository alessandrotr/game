import {
  MATCH_KILL_TARGET,
  MATCH_RESULT_LINGER_MS,
  ServerMessage,
  teamKillTargetFor,
  type LobbyMode,
  type Team,
} from '@arena/shared';
import type { Player } from '../../schema.js';
import type { ArenaContext } from '../context.js';

/**
 * Ranked-match outcome tracking. A matchmade game ends decisively when one team
 * reaches the combined kill target; the public free-for-all arena (portal) is
 * never ranked, so this stays inert there.
 */
export class ArenaMatch {
  /** A ranked match (from matchmaking) ends decisively; false for the portal arena. */
  ranked = false;
  /** Combined kills a team must reach to win. */
  teamKillTarget = MATCH_KILL_TARGET;
  /** Latched once a winner is decided; the room freezes the sim for the results screen. */
  matchOver = false;
  /** Win/loss verdict per session, read when each player leaves (DB persistence). */
  private readonly outcomes = new Map<string, 'win' | 'loss'>();

  constructor(private readonly ctx: ArenaContext) {}

  /** Configure for a ranked, mode-sized match (called from `onCreate`). */
  configureRanked(mode: LobbyMode): void {
    this.ranked = true;
    this.teamKillTarget = teamKillTargetFor(mode);
  }

  outcomeFor(sessionId: string): 'win' | 'loss' | undefined {
    return this.outcomes.get(sessionId);
  }

  forget(sessionId: string): void {
    this.outcomes.delete(sessionId);
  }

  /** Record a credited kill: end the match once the killer's team hits the target. */
  recordKill(killer: Player): void {
    if (!this.ranked || this.matchOver) return;
    const team = killer.team === 'red' ? 'red' : 'blue';
    if (this.teamKills(team) >= this.teamKillTarget) this.endMatch(team);
  }

  /** Combined live kills for a team (the team-aggregate win metric). */
  private teamKills(team: Team): number {
    let total = 0;
    this.ctx.state.players.forEach((player) => {
      if (player.team === team) total += player.kills;
    });
    return total;
  }

  /** Decide the match: record each player's verdict by team, broadcast the final
   *  scoreboard, and schedule a dispose backstop so the room frees up. */
  private endMatch(winnerTeam: Team): void {
    this.matchOver = true;
    const scores: { id: string; name: string; team: Team; kills: number; deaths: number }[] = [];
    this.ctx.state.players.forEach((player, sessionId) => {
      const team = player.team === 'red' ? 'red' : 'blue';
      this.outcomes.set(sessionId, team === winnerTeam ? 'win' : 'loss');
      scores.push({
        id: sessionId,
        name: player.name,
        team,
        kills: player.kills,
        deaths: player.deaths,
      });
    });
    this.ctx.broadcast(ServerMessage.MatchOver, {
      winnerTeam,
      target: this.teamKillTarget,
      scores,
    });
    // Clients return to town on their own; dispose as a backstop if they linger.
    this.ctx.setTimeout(() => this.ctx.disconnect(), MATCH_RESULT_LINGER_MS);
  }
}
