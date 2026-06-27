import type { MatchScore, Team } from '@arena/shared';
import { useMatchResultStore } from '../store/useMatchResultStore';
import { useGameStore } from '../store/useGameStore';
import { Card, Overlay } from './primitives';
import { RematchControls } from './RematchControls';
import { STAT_COLORS, TEAM_COLORS, TEAM_LABELS } from './theme';

/**
 * End-of-match overlay (ranked team match). Shown when the server broadcasts
 * `MatchOver`: declares Victory/Defeat for the local player's team, lists the
 * final Blue/Red scoreboard, and offers a rematch (or return to town). The screen
 * stays up until the rematch vote resolves — no auto-close.
 */
export function MatchResult() {
  const result = useMatchResultStore((s) => s.result);
  const sessionId = useGameStore((s) => s.sessionId);

  if (!result) return null;

  const myTeam = result.scores.find((s) => s.id === sessionId)?.team;
  const won = myTeam === result.winnerTeam;
  const accent = won ? STAT_COLORS.positive : STAT_COLORS.negative;

  return (
    <Overlay closeOnBackdrop={false}>
      <Card variant="modal" className="w-[440px]">
        <div
          className="px-6 py-5 text-center"
          style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 13%, transparent), transparent)` }}
        >
          <div
            className="font-display text-3xl font-bold tracking-wide"
            style={{ color: accent, textShadow: `0 0 20px color-mix(in srgb, ${accent} 40%, transparent)` }}
          >
            {won ? 'Victory' : 'Defeat'}
          </div>
          <div className="mt-1 text-xs text-muted">
            <span style={{ color: TEAM_COLORS[result.winnerTeam] }}>
              {TEAM_LABELS[result.winnerTeam]} team
            </span>{' '}
            won · first to {result.target} kills
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 px-6 pb-2 pt-1">
          <TeamColumn team="blue" scores={result.scores} mySessionId={sessionId} />
          <TeamColumn team="red" scores={result.scores} mySessionId={sessionId} />
        </div>

        <div className="px-6 pb-5 pt-3">
          <RematchControls />
        </div>
      </Card>
    </Overlay>
  );
}

/** One team's scoreboard column, sorted by kills. */
function TeamColumn({
  team,
  scores,
  mySessionId,
}: {
  team: Team;
  scores: MatchScore[];
  mySessionId: string | null;
}) {
  const color = TEAM_COLORS[team];
  const rows = scores.filter((s) => s.team === team).sort((a, b) => b.kills - a.kills);
  const total = rows.reduce((sum, s) => sum + s.kills, 0);
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}>
      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider" style={{ color }}>
        <span>{TEAM_LABELS[team]}</span>
        <span className="tabular-nums">{total}</span>
      </div>
      {rows.map((s) => {
        const isMe = s.id === mySessionId;
        return (
          <div key={s.id} className="flex items-center justify-between py-1 text-sm">
            <span className={isMe ? 'font-semibold text-text' : 'text-muted'}>
              {s.name}
              {isMe && <span className="ml-1 text-[10px] text-muted">(you)</span>}
            </span>
            <span className="tabular-nums text-muted">
              <span className="font-bold text-text">{s.kills}</span>/<span>{s.deaths}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
