import { getClassDefinition, isCharacterClass, type LeaderboardEntry } from '@arena/shared';
import { Trophy, X } from 'lucide-react';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { requestLeaderboard } from '../network/colyseus';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  IconButton,
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

function Row({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const cls = classInfo(entry.characterClass);
  const rankColor = RANK_COLOR[rank - 1] ?? '#8b91a8';
  return (
    <TableRow>
      <TableCell className="text-right font-bold tabular-nums" style={{ color: rankColor }}>
        {rank}
      </TableCell>
      <TableCell className="max-w-[150px] truncate font-semibold text-text">{entry.name}</TableCell>
      <TableCell className="text-xs font-medium" style={{ color: cls.color }}>
        {cls.name}
      </TableCell>
      <TableCell className="text-center text-xs text-muted">Lv{entry.level}</TableCell>
      <TableCell className="text-right tabular-nums" title="Kills / Deaths">
        <span className="font-bold text-positive">{entry.kills}</span>
        <span className="text-muted">/</span>
        <span className="font-bold text-negative">{entry.deaths}</span>
      </TableCell>
      <TableCell className="text-right tabular-nums" title="Wins–Losses">
        <span className="font-bold text-positive">{entry.wins}</span>
        <span className="text-muted">-</span>
        <span className="font-bold text-negative">{entry.losses}</span>
      </TableCell>
    </TableRow>
  );
}

/**
 * Global leaderboard (town): a trigger button plus a modal listing the top
 * players by wins. Data is fetched on open via a `RequestLeaderboard` round-trip.
 */
export function Leaderboard() {
  const { open, loading, enabled, entries, setOpen, setLoading } = useLeaderboardStore();

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

      <DialogContent className="w-[420px]" aria-describedby={undefined}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold tracking-wide text-gold">
            <Trophy size={18} aria-hidden="true" />
            Leaderboard
          </DialogTitle>
          <DialogClose asChild>
            <IconButton icon={X} aria-label="Close" />
          </DialogClose>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
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
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8 text-right">#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="w-14">Class</TableHead>
                  <TableHead className="w-10 text-center">Lvl</TableHead>
                  <TableHead className="text-right">K / D</TableHead>
                  <TableHead className="text-right">W–L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, i) => (
                  <Row key={i} entry={entry} rank={i + 1} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
