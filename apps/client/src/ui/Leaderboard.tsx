import { getClassDefinition, isCharacterClass, type LeaderboardEntry } from '@arena/shared';
import { Trophy, X } from 'lucide-react';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { useAuthStore } from '../store/useAuthStore';
import { requestLeaderboard } from '../network/colyseus';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  IconButton,
  LevelBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './primitives';

/** Resolve a class string to its display name + accent color (safe for unknowns). */
function classInfo(characterClass: string): { name: string; color: string } {
  if (isCharacterClass(characterClass)) {
    const def = getClassDefinition(characterClass);
    return { name: def.name, color: def.color };
  }
  return { name: characterClass || '—', color: '#8b91a8' };
}

const RANK_COLOR = ['#f5d061', '#cdd3e0', '#cd8c52']; // gold / silver / bronze

/** Win rate as a whole percent, or null when the player has no decided matches. */
function winRate(wins: number, losses: number): number | null {
  const total = wins + losses;
  return total === 0 ? null : Math.round((wins / total) * 100);
}

/** Case-insensitive name match so the local player's row can be highlighted. */
function isLocalPlayer(name: string, username: string | null): boolean {
  return !!username && name.trim().toLowerCase() === username.trim().toLowerCase();
}

/**
 * Rank chip: a medal-tinted disc for the podium (1–3), a quiet numeral below it.
 * The tint is the single place we spend color on rank, so position reads instantly
 * without the table turning into a christmas tree.
 */
function RankBadge({ rank }: { rank: number }) {
  const medal = RANK_COLOR[rank - 1];
  if (!medal) {
    return (
      <span className="grid h-7 w-7 place-items-center text-[13px] font-semibold tabular-nums text-muted">
        {rank}
      </span>
    );
  }
  return (
    <span
      className="grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold tabular-nums"
      style={{
        color: medal,
        background: `color-mix(in srgb, ${medal} 15%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${medal} 55%, transparent)`,
      }}
    >
      {rank}
    </span>
  );
}

/** Small inline marker for the viewer's own row. */
function YouTag() {
  return (
    <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
      You
    </span>
  );
}

/** K / D pair, shared between layouts. */
function KillDeath({ kills, deaths }: { kills: number; deaths: number }) {
  return (
    <span className="tabular-nums" title="Kills / Deaths">
      <span className="font-semibold text-positive">{kills}</span>
      <span className="text-muted">/</span>
      <span className="font-semibold text-negative">{deaths}</span>
    </span>
  );
}

/** W–L record with the derived win-rate as a quiet secondary insight. */
function Record({ wins, losses }: { wins: number; losses: number }) {
  const rate = winRate(wins, losses);
  return (
    <span className="inline-flex items-baseline gap-1.5 tabular-nums" title="Wins–Losses">
      <span>
        <span className="font-semibold text-positive">{wins}</span>
        <span className="text-muted">–</span>
        <span className="font-semibold text-negative">{losses}</span>
      </span>
      {rate !== null && <span className="text-[11px] text-muted">{rate}%</span>}
    </span>
  );
}

/** Desktop row — dense, aligned columns. */
function DeskRow({ entry, rank, me }: { entry: LeaderboardEntry; rank: number; me: boolean }) {
  const cls = classInfo(entry.characterClass);
  return (
    <TableRow
      className={me ? 'bg-gold/[0.07] hover:bg-gold/10' : undefined}
      style={me ? { boxShadow: 'inset 2px 0 0 0 var(--color-gold)' } : undefined}
    >
      <TableCell className="border-r border-white/10 py-2.5 pl-4 pr-3">
        <RankBadge rank={rank} />
      </TableCell>
      <TableCell className="py-2.5 pl-3">
        <div className="flex items-center gap-2.5">
          <LevelBadge level={entry.level} size="xs" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="max-w-[150px] truncate font-semibold text-text">{entry.name}</span>
              {me && <YouTag />}
            </div>
            <div className="mt-0.5 truncate text-[11px]" style={{ color: cls.color }}>
              {cls.name}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="py-2.5 text-right text-sm">
        <KillDeath kills={entry.kills} deaths={entry.deaths} />
      </TableCell>
      <TableCell className="py-2.5 pr-4 text-right text-sm">
        <Record wins={entry.wins} losses={entry.losses} />
      </TableCell>
    </TableRow>
  );
}

/** Mobile row — stacked card: identity on top, stats on a second line. No scroll. */
function MobileRow({ entry, rank, me }: { entry: LeaderboardEntry; rank: number; me: boolean }) {
  const cls = classInfo(entry.characterClass);
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${me ? 'bg-gold/[0.07]' : ''}`}
      style={me ? { boxShadow: 'inset 2px 0 0 0 var(--color-gold)' } : undefined}
    >
      <RankBadge rank={rank} />
      <LevelBadge level={entry.level} size="xxs" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-text">{entry.name}</span>
          {me && <YouTag />}
        </div>
        <div className="truncate text-[11px]" style={{ color: cls.color }}>
          {cls.name}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-sm">
        <Record wins={entry.wins} losses={entry.losses} />
        <span className="text-[11px] text-muted">
          <KillDeath kills={entry.kills} deaths={entry.deaths} /> K/D
        </span>
      </div>
    </li>
  );
}

/** Animated placeholder rows shown while standings are in flight. */
function LoadingRows() {
  return (
    <ul className="divide-y divide-white/5">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3.5">
          <span className="h-7 w-7 shrink-0 rounded-full bg-white/5" />
          <div className="flex-1 space-y-1.5">
            <span className="block h-3 w-28 rounded bg-white/5" />
            <span className="block h-2.5 w-16 rounded bg-white/5" />
          </div>
          <span className="h-3 w-12 rounded bg-white/5" />
        </li>
      ))}
    </ul>
  );
}

/** Centered, calm state for empty / disabled standings. */
function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
      <Trophy size={28} className="text-muted/50" aria-hidden="true" />
      <p className="max-w-[260px] text-sm text-muted">{children}</p>
    </div>
  );
}

/**
 * Global leaderboard (town): a trigger button plus a modal listing the top
 * players ranked by wins. Data is fetched on open via a `RequestLeaderboard`
 * round-trip. The modal is a dense table on desktop and reflows to a stacked
 * card list on mobile so it never scrolls sideways.
 */
export function Leaderboard() {
  const { open, loading, enabled, entries, setOpen, setLoading } = useLeaderboardStore();
  const username = useAuthStore((s) => s.username);

  // Fetch fresh standings each time the dialog opens; Radix drives open/close.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setLoading(true);
      requestLeaderboard();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="panel"
          className="font-display pointer-events-auto gap-1.5 bg-panel/90 px-3 py-2 text-xs backdrop-blur-md"
        >
          <Trophy size={14} aria-hidden="true" />
          Leaderboard
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 sm:max-w-xl" aria-describedby={undefined}>
        {/* Header — title, the metric it's ranked by (transparency), close. */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold tracking-wide text-gold">
              <Trophy size={18} aria-hidden="true" />
              Leaderboard
            </DialogTitle>
            <p className="mt-0.5 text-[11px] text-muted">Top players ranked by total wins</p>
          </div>
          <DialogClose asChild>
            <IconButton icon={X} aria-label="Close" />
          </DialogClose>
        </div>

        <div className="max-h-[65vh] overflow-y-auto overscroll-contain">
          {loading ? (
            <LoadingRows />
          ) : !enabled ? (
            <EmptyState>Persistence is disabled on this server — no standings yet.</EmptyState>
          ) : entries.length === 0 ? (
            <EmptyState>No ranked matches played yet. Be the first to win one!</EmptyState>
          ) : (
            <>
              {/* Desktop: dense aligned table with a sticky header. */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-panel/95 backdrop-blur-sm">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-14 border-r border-white/10 pl-4 pr-3" />
                      <TableHead className="pl-3">Player</TableHead>
                      <TableHead className="text-right">K / D</TableHead>
                      <TableHead className="pr-4 text-right">W–L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry, i) => (
                      <DeskRow key={i} entry={entry} rank={i + 1} me={isLocalPlayer(entry.name, username)} />
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: stacked cards, no horizontal scroll. */}
              <ul className="divide-y divide-white/5 sm:hidden">
                {entries.map((entry, i) => (
                  <MobileRow key={i} entry={entry} rank={i + 1} me={isLocalPlayer(entry.name, username)} />
                ))}
              </ul>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
