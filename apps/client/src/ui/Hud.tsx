import { RotateCcw, Users } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { leaveToCharacterSelect } from '../network/colyseus';
import { Badge, Button } from './primitives';
import { ActionBar } from './ActionBar';
import { QueuePanel } from './QueuePanel';
import { PlayerCard } from './PlayerCard';
import { MatchResult } from './MatchResult';
import { Leaderboard } from './Leaderboard';
import { LevelUpToast } from './LevelUpToast';
import { Paperdoll } from './Paperdoll';

/** In-game heads-up display: the player card, controls hint, and action bar. */
export function Hud() {
  const playerIds = useGameStore((s) => s.playerIds);
  const inArena = useGameStore((s) => s.room) === 'arena';

  return (
    <>
      {/* Left column: player card + (town) the change-character button under it. */}
      <div className="pointer-events-none absolute left-4 top-4 flex w-64 flex-col items-stretch gap-2">
        <PlayerCard />
        {!inArena && (
          <Button
            variant="panel"
            onClick={() => void leaveToCharacterSelect()}
            className="pointer-events-auto gap-1.5 px-3 py-2 text-xs backdrop-blur-md"
          >
            <RotateCcw size={13} aria-hidden="true" />
            Change Character
          </Button>
        )}
      </div>

      {/* Online count, top-right. */}
      <Badge variant="neutral" className="pointer-events-none absolute right-4 top-4 gap-1.5">
        <Users size={12} aria-hidden="true" />
        {playerIds.length} online
      </Badge>

      <div className="pointer-events-none absolute bottom-[92px] left-1/2 -translate-x-1/2 text-xs tracking-wide text-muted">
        {inArena
          ? 'Right-click move · Left-click enemy to attack · Space jump · Q W E R · 1-2 dance'
          : 'Right-click move · Click a player to inspect · Space jump · 1-2 dance · Enter to chat'}
      </div>

      {inArena ? <ActionBar /> : <QueuePanel />}
      {!inArena && <Leaderboard />}

      <MatchResult />
      <LevelUpToast />
      <Paperdoll />
    </>
  );
}
