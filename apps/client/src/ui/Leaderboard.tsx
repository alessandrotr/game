import { getClassDefinition, isCharacterClass, type LeaderboardEntry } from '@arena/shared';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { requestLeaderboard } from '../network/colyseus';

/** Resolve a class string to its display name + accent color (safe for unknowns). */
function classInfo(characterClass: string): { name: string; color: string } {
  if (isCharacterClass(characterClass)) {
    const def = getClassDefinition(characterClass);
    return { name: def.name, color: def.color };
  }
  return { name: characterClass || '—', color: '#8b91a8' };
}

const RANK_COLOR = ['#f5d061', '#cdd3e0', '#cd8c52']; // gold / silver / bronze

function Row({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const cls = classInfo(entry.characterClass);
  const rankColor = RANK_COLOR[rank - 1] ?? '#8b91a8';
  return (
    <div className="flex items-center gap-3 border-b border-white/5 py-2 text-sm last:border-b-0">
      <span className="w-6 text-right font-bold tabular-nums" style={{ color: rankColor }}>
        {rank}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold text-text">{entry.name}</span>
      <span className="w-16 text-xs font-medium" style={{ color: cls.color }}>
        {cls.name}
      </span>
      <span className="w-10 text-center text-xs text-muted">Lv{entry.level}</span>
      <span className="w-16 text-right tabular-nums">
        <span className="font-bold text-[#5fe08a]">{entry.wins}</span>
        <span className="text-muted">-</span>
        <span className="font-bold text-[#ff7a7a]">{entry.losses}</span>
      </span>
    </div>
  );
}

/**
 * Global leaderboard (town): a trigger button plus a modal listing the top
 * players by wins. Data is fetched on open via a `RequestLeaderboard` round-trip.
 */
export function Leaderboard() {
  const { open, loading, enabled, entries, setOpen, setLoading } = useLeaderboardStore();

  const onOpen = () => {
    setOpen(true);
    setLoading(true);
    requestLeaderboard();
  };

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="font-display pointer-events-auto absolute left-1/2 top-16 -translate-x-1/2 rounded-xl border border-white/10 bg-panel/90 px-4 py-2 text-xs tracking-wide text-muted transition hover:text-text hover:brightness-110"
      >
        🏆 Leaderboard
      </button>

      {open && (
        <div
          className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-panel/95 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="font-display text-lg font-bold tracking-wide text-gold">
                🏆 Leaderboard
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted transition hover:text-text"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-2">
              {loading ? (
                <div className="py-10 text-center text-sm text-muted">Loading…</div>
              ) : !enabled ? (
                <div className="py-10 text-center text-sm text-muted">
                  Persistence is disabled on this server — no standings yet.
                </div>
              ) : entries.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted">
                  No ranked matches played yet. Be the first to win one!
                </div>
              ) : (
                entries.map((entry, i) => <Row key={i} entry={entry} rank={i + 1} />)
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
