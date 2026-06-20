import { useEffect } from 'react';
import {
  getClassDefinition,
  isCharacterClass,
  LEADERBOARD_CATEGORIES,
  type LeaderboardCategory,
  type LeaderboardEntry,
} from '@arena/shared';
import { Trophy, X } from 'lucide-react';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { useAuthStore } from '../store/useAuthStore';
import { useFocusStore } from '../store/useFocusStore';
import { requestLeaderboard } from '../network/colyseus';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  LevelBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './primitives';

/** Resolve a class string to its display name (safe for unknowns). */
function classInfo(characterClass: string): { name: string } {
  if (isCharacterClass(characterClass)) {
    return { name: getClassDefinition(characterClass).name };
  }
  return { name: characterClass || '—' };
}

const RANK_COLOR = ['#f5d061', '#cdd3e0', '#cd8c52']; // gold / silver / bronze

/** Per-category display copy: the tab label and the section sub-label blurb. */
const CATEGORY_META: Record<LeaderboardCategory, { tab: string; blurb: string }> = {
  wins: { tab: 'Wins', blurb: 'by total wins' },
  losses: { tab: 'Losses', blurb: 'by total losses' },
  kills: { tab: 'Kills', blurb: 'by total kills' },
  deaths: { tab: 'Deaths', blurb: 'by total deaths' },
  level: { tab: 'Level', blurb: 'by level' },
};

/** Which stat group a category emphasizes, so rows can highlight the ranked
 *  metric and quiet the rest. K/D and W–L each pair two categories. */
function accentOf(category: LeaderboardCategory): {
  kd: boolean;
  wl: boolean;
  level: boolean;
} {
  return {
    kd: category === 'kills' || category === 'deaths',
    wl: category === 'wins' || category === 'losses',
    level: category === 'level',
  };
}

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
  // Derive a polished-metal palette from the base medal hue so all three coins
  // share the same lighting model: bright top-left, hue mid, darkened rim.
  const light = `color-mix(in srgb, ${medal} 50%, #ffffff)`;
  const dark = `color-mix(in srgb, ${medal} 78%, #000000)`;
  const ink = `color-mix(in srgb, ${medal} 28%, #100b02)`;
  const glow = `color-mix(in srgb, ${medal} 45%, transparent)`;
  return (
    <span
      className="relative grid h-7 w-7 place-items-center rounded-full text-[12px] font-extrabold tabular-nums"
      style={{
        color: ink,
        background: `radial-gradient(120% 120% at 32% 24%, ${light} 0%, ${medal} 42%, ${dark} 100%)`,
        boxShadow: [
          'inset 0 1px 1.5px rgba(255,255,255,0.6)', // top bevel highlight
          'inset 0 -1.5px 2px rgba(0,0,0,0.4)', // bottom bevel shadow
          `inset 0 0 0 1px color-mix(in srgb, ${dark} 70%, transparent)`, // crisp rim
          `0 2px 5px -1px ${glow}`, // soft colored drop glow
        ].join(', '),
        textShadow: '0 1px 0 rgba(255,255,255,0.3)', // engraved numeral
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

/** Underline the number the active leaderboard ranks by, so the eye lands on the
 *  metric that ordered the rows without losing the K/D • W–L semantic colors. */
const RANKED = 'underline decoration-gold/70 decoration-2 underline-offset-2';

/** K / D pair, shared between layouts. `category` decides emphasis: the whole
 *  pair dims when this isn't the active board; the ranked number is underlined. */
function KillDeath({
  kills,
  deaths,
  category,
}: {
  kills: number;
  deaths: number;
  category: LeaderboardCategory;
}) {
  const a = accentOf(category);
  return (
    <span className={`tabular-nums ${a.kd ? '' : 'opacity-45'}`} title="Kills / Deaths">
      <span className={`font-semibold text-positive ${category === 'kills' ? RANKED : ''}`}>
        {kills}
      </span>
      <span className="text-muted">/</span>
      <span className={`font-semibold text-negative ${category === 'deaths' ? RANKED : ''}`}>
        {deaths}
      </span>
    </span>
  );
}

/** W–L record with the derived win-rate as a quiet secondary insight. Dims when
 *  this isn't the active board; the ranked number (wins or losses) is underlined. */
function Record({
  wins,
  losses,
  category,
}: {
  wins: number;
  losses: number;
  category: LeaderboardCategory;
}) {
  const a = accentOf(category);
  const rate = winRate(wins, losses);
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 tabular-nums ${a.wl ? '' : 'opacity-45'}`}
      title="Wins–Losses"
    >
      <span>
        <span className={`font-semibold text-positive ${category === 'wins' ? RANKED : ''}`}>
          {wins}
        </span>
        <span className="text-muted">–</span>
        <span className={`font-semibold text-negative ${category === 'losses' ? RANKED : ''}`}>
          {losses}
        </span>
      </span>
      {rate !== null && <span className="text-[0.8em] text-muted">{rate}%</span>}
    </span>
  );
}

/** Segmented control to switch the active leaderboard. Scrolls rather than wraps
 *  on narrow panels so all five categories stay reachable without a layout jump. */
function CategoryTabs({
  active,
  onPick,
}: {
  active: LeaderboardCategory;
  onPick: (c: LeaderboardCategory) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Leaderboard category"
      className="flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-1"
    >
      {LEADERBOARD_CATEGORIES.map((c) => {
        const on = c === active;
        return (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onPick(c)}
            className={
              'flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[clamp(0.72rem,2.2cqi,0.9rem)] font-semibold transition ' +
              (on
                ? 'bg-gold/20 text-gold shadow-[inset_0_0_0_1px_var(--color-gold)]'
                : 'text-muted hover:bg-white/5 hover:text-text')
            }
          >
            {CATEGORY_META[c].tab}
          </button>
        );
      })}
    </div>
  );
}

/** A gold ring on the level badge when the board is ranked by level. */
function LevelChip({ level, active, size }: { level: number; active: boolean; size: 'xs' | 'xxs' }) {
  return (
    <span
      className={active ? 'rounded-md shadow-[0_0_0_1.5px_var(--color-gold)]' : undefined}
      title={active ? 'Ranked by level' : undefined}
    >
      <LevelBadge level={level} size={size} />
    </span>
  );
}

/** Desktop row — dense, aligned columns. */
function DeskRow({
  entry,
  rank,
  me,
  category,
}: {
  entry: LeaderboardEntry;
  rank: number;
  me: boolean;
  category: LeaderboardCategory;
}) {
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
          <LevelChip level={entry.level} active={category === 'level'} size="xs" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="max-w-[150px] truncate font-semibold text-text">{entry.name}</span>
              {me && <YouTag />}
            </div>
            <div className="mt-0.5 truncate text-[0.8em] text-muted">
              {cls.name}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="py-2.5 text-right text-[0.92em]">
        <KillDeath kills={entry.kills} deaths={entry.deaths} category={category} />
      </TableCell>
      <TableCell className="py-2.5 pr-4 text-right text-[0.92em]">
        <Record wins={entry.wins} losses={entry.losses} category={category} />
      </TableCell>
    </TableRow>
  );
}

/** Mobile row — stacked card: identity on top, stats on a second line. No scroll. */
function MobileRow({
  entry,
  rank,
  me,
  category,
}: {
  entry: LeaderboardEntry;
  rank: number;
  me: boolean;
  category: LeaderboardCategory;
}) {
  const cls = classInfo(entry.characterClass);
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${me ? 'bg-gold/[0.07]' : ''}`}
      style={me ? { boxShadow: 'inset 2px 0 0 0 var(--color-gold)' } : undefined}
    >
      <RankBadge rank={rank} />
      <LevelChip level={entry.level} active={category === 'level'} size="xxs" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-text">{entry.name}</span>
          {me && <YouTag />}
        </div>
        <div className="truncate text-[0.8em] text-muted">
          {cls.name}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-[0.92em]">
        <Record wins={entry.wins} losses={entry.losses} category={category} />
        <span className="text-[0.8em] text-muted">
          <KillDeath kills={entry.kills} deaths={entry.deaths} category={category} /> K/D
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

/** Gold section label with a divider tick — matches the matchmaking menu. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/80">
      <span className="h-px w-5 bg-linear-to-r from-gold/70 to-transparent" />
      {children}
    </span>
  );
}

/**
 * Global leaderboard (town): a store-controlled modal listing the top players
 * ranked by wins. Opened from the game menu (no built-in trigger). Data is
 * fetched on open via a `RequestLeaderboard` round-trip. The modal is a dense
 * table on desktop and reflows to a stacked card list on mobile so it never
 * scrolls sideways.
 */
export function Leaderboard() {
  const { open, loading, enabled, category, boards, setOpen, setLoading, setCategory } =
    useLeaderboardStore();
  const entries = boards[category] ?? [];
  const username = useAuthStore((s) => s.username);
  // Cinematic focus engaged from the town tablet → dock right, no backdrop, so the
  // podium champions stay visible on the left. Centered (today's look) otherwise.
  const docked = useFocusStore((s) => s.panel === 'leaderboard' && !!s.target);

  // Fetch fresh standings whenever the dialog opens or the active tab changes.
  // Radix's onOpenChange only fires for its own close interactions, so an
  // externally-driven `open` (the game menu) wouldn't trigger a fetch otherwise.
  // Show the spinner only when this tab has no cached rows yet — switching back
  // to an already-seen board shows it instantly and refreshes silently. Read the
  // cache via getState so a reply landing doesn't re-trigger this effect (loop).
  useEffect(() => {
    if (!open) return;
    if (!useLeaderboardStore.getState().boards[category]) setLoading(true);
    requestLeaderboard(category);
  }, [open, category, setLoading]);

  // Release the camera focus + movement lock whenever the dialog isn't open, and
  // on unmount (e.g. leaving town) so a stale focus can't hijack another scene.
  useEffect(() => {
    if (!open) useFocusStore.getState().clear('leaderboard');
  }, [open]);
  useEffect(() => () => useFocusStore.getState().clear('leaderboard'), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        dock={docked ? 'right' : 'center'}
        backdrop={!docked}
        // Frosted panel matching the matchmaking menu. A container so the contents
        // size in `cqi` (% of panel width), scaling with the panel — which itself
        // scales with the viewport when docked, bounded when centered.
        style={{ containerType: 'inline-size' }}
        className={
          'flex max-h-[85vh] flex-col overflow-hidden border-white/10 bg-panel/55 p-0 backdrop-blur-2xl ' +
          (docked ? 'w-[clamp(34rem,44vw,62rem)] max-w-none' : 'max-w-md sm:max-w-xl')
        }
        aria-describedby={undefined}
      >
        {/* Slim header — icon crest + title + close (matchmaking style). */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <DialogTitle className="flex items-center gap-2 font-display text-[clamp(0.95rem,2.8cqi,1.3rem)] font-semibold tracking-wide text-text">
            <Trophy size={16} className="text-gold" aria-hidden="true" />
            Leaderboard
          </DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              className="rounded-lg p-1 text-muted transition hover:bg-white/10 hover:text-text"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </DialogClose>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-5 pb-5 pt-3">
          <CategoryTabs active={category} onPick={setCategory} />
          <SectionLabel>Top players · {CATEGORY_META[category].blurb}</SectionLabel>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-black/15 text-[clamp(0.82rem,2.7cqi,1.12rem)]">
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
                        <TableHead
                          className={
                            'text-right ' + (accentOf(category).kd ? 'text-gold' : '')
                          }
                        >
                          K / D
                        </TableHead>
                        <TableHead
                          className={
                            'pr-4 text-right ' + (accentOf(category).wl ? 'text-gold' : '')
                          }
                        >
                          W–L
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry, i) => (
                        <DeskRow
                          key={i}
                          entry={entry}
                          rank={i + 1}
                          me={isLocalPlayer(entry.name, username)}
                          category={category}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile: stacked cards, no horizontal scroll. */}
                <ul className="divide-y divide-white/5 sm:hidden">
                  {entries.map((entry, i) => (
                    <MobileRow
                      key={i}
                      entry={entry}
                      rank={i + 1}
                      me={isLocalPlayer(entry.name, username)}
                      category={category}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
