import { useEffect, useState } from 'react';
import { useMatchResultStore } from '../store/useMatchResultStore';
import { useGameStore } from '../store/useGameStore';
import { travelTo } from '../network/colyseus';
import { Button, Card, Overlay } from './primitives';
import { STAT_COLORS } from './theme';

/** Seconds the results screen shows before auto-returning to town. */
const AUTO_RETURN_SECONDS = 8;

/**
 * End-of-match overlay (ranked 1v1). Shown when the server broadcasts
 * `MatchOver`: declares Victory/Defeat for the local player, lists the final
 * scoreboard, and returns to town — on a button or after a short countdown.
 */
export function MatchResult() {
  const result = useMatchResultStore((s) => s.result);
  const sessionId = useGameStore((s) => s.sessionId);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RETURN_SECONDS);

  // Tick down and return to town once the result is shown.
  useEffect(() => {
    if (!result) return;
    setSecondsLeft(AUTO_RETURN_SECONDS);
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          void travelTo('town');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [result]);

  if (!result) return null;

  const won = result.winnerId === sessionId;
  const accent = won ? STAT_COLORS.positive : STAT_COLORS.negative;
  const scores = [...result.scores].sort((a, b) => b.kills - a.kills);

  return (
    <Overlay closeOnBackdrop={false}>
      <Card variant="modal" className="w-[340px]">
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
            {result.winnerName} won · first to {result.target} kills
          </div>
        </div>

        <div className="px-6 pb-2">
          {scores.map((s) => {
            const isMe = s.id === sessionId;
            return (
              <div
                key={s.id}
                className="flex items-center justify-between border-b border-white/5 py-2.5 text-sm last:border-b-0"
              >
                <span className={isMe ? 'font-semibold text-text' : 'text-muted'}>
                  {s.name}
                  {isMe && <span className="ml-1 text-[10px] text-muted">(you)</span>}
                </span>
                <span className="tabular-nums text-muted">
                  <span className="font-bold text-text">{s.kills}</span> K ·{' '}
                  <span className="font-bold text-text">{s.deaths}</span> D
                </span>
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-5 pt-3">
          <Button
            variant="gold"
            onClick={() => void travelTo('town')}
            className="w-full px-5 py-2.5 shadow-none"
          >
            Return to Town
          </Button>
          <div className="mt-2 text-center text-[11px] text-muted">
            Returning automatically in {secondsLeft}s…
          </div>
        </div>
      </Card>
    </Overlay>
  );
}
