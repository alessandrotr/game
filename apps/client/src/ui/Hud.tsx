import { RotateCcw } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { leaveToCharacterSelect } from '../network/colyseus';
import { Button } from './primitives';
import { ActionBar } from './ActionBar';
import { Matchmaking } from './Matchmaking';
import { PlayerCard } from './PlayerCard';
import { MatchResult } from './MatchResult';
import { Leaderboard } from './Leaderboard';
import { LevelUpToast } from './LevelUpToast';
import { Paperdoll } from './Paperdoll';

/** In-game heads-up display: the player card, controls hint, and action bar. */
export function Hud() {
  const inArena = useGameStore((s) => s.room) === 'arena';

  return (
    <>
      {/* Left column: player card + (town) the change-character and leaderboard
          buttons stacked under it. */}
      <div className="pointer-events-none absolute left-4 top-4 flex w-64 flex-col items-stretch gap-2">
        <PlayerCard />
        {!inArena && (
          <>
            <Button
              variant="panel"
              onClick={() => void leaveToCharacterSelect()}
              className="pointer-events-auto gap-1.5 px-3 py-2 text-xs backdrop-blur-md"
            >
              <RotateCcw size={13} aria-hidden="true" />
              Change Character
            </Button>
            <Leaderboard />
          </>
        )}
      </div>

      {inArena ? <ActionBar /> : <Matchmaking />}

      <MatchResult />
      <LevelUpToast />
      <Paperdoll />
    </>
  );
}
