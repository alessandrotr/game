import { useGameStore } from '../store/useGameStore';
import { leaveToCharacterSelect } from '../network/colyseus';
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
      <PlayerCard />

      {/* Online count, top-right. */}
      <div className="pointer-events-none absolute right-4 top-4 rounded-full border border-white/10 bg-panel/80 px-3 py-1.5 text-xs text-muted backdrop-blur-sm">
        ◍ {playerIds.length} online
      </div>

      {/* Back to character select — town only, so you can't bail mid-match. */}
      {!inArena && (
        <button
          type="button"
          onClick={() => void leaveToCharacterSelect()}
          className="pointer-events-auto absolute right-4 top-12 rounded-full border border-white/10 bg-panel/80 px-3 py-1.5 text-xs text-muted backdrop-blur-sm transition hover:text-text hover:brightness-110"
        >
          ↩ Change Character
        </button>
      )}

      <div className="pointer-events-none absolute bottom-[92px] left-1/2 -translate-x-1/2 text-xs tracking-wide text-muted">
        {inArena
          ? 'Right-click move · Left-click enemy to attack · Space jump · Q W E R · 1-2 dance'
          : 'Right-click move · Click a player to inspect · Space jump · 1-2 dance · F talk · Enter to chat'}
      </div>

      {inArena ? <ActionBar /> : <QueuePanel />}
      {!inArena && <Leaderboard />}

      <MatchResult />
      <LevelUpToast />
      <Paperdoll />
    </>
  );
}
