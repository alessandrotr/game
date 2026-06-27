import { useEffect, useState, type ReactNode } from 'react';
import {
  ABILITIES,
  ABILITY_SLOTS,
  CLASS_LOADOUTS,
  describeAbility,
  getClassDefinition,
  EMPTY_ZOMBIE_STATS,
  type AbilityKind,
  type AbilitySlot,
  type CharacterClass,
  type RunHistoryEntry,
  type ZombieClassStats,
} from '@arena/shared';
import { fetchRunHistory } from '../network/auth';
import {
  Bomb,
  Crown,
  DoorOpen,
  Flag,
  Flame,
  Gem,
  Percent,
  Rabbit,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Target,
  Timer,
  Trophy,
  UserRound,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { ABILITY_ICON } from './abilityIcons';
import { ClassVitals } from './ClassVitals';
import { PANEL_SURFACE, SidebarHeader } from './hud/sidebar/panelChrome';
import { STAT_COLORS } from './theme';

/**
 * The player's own "paperdoll" character sheet. The champion stands free to the
 * left (the very same `Showcase` the store uses) beside its own info panel on the
 * right: the class vitals, the QWER ability kit (with rich tooltips), the lifetime
 * record, and a jump into the wardrobe. Opened from the champion portrait at the
 * top of the town rail. The borderless positioning container + backdrop are the
 * host wrapper's; this is just the showcase + the right panel.
 */
type SheetTab = 'profile' | 'record' | 'history';

export function CharacterSheet({ onClose }: { onClose: () => void }) {
  const sessionId = useGameStore((s) => s.sessionId);
  useGameStore((s) => s.tick); // track live level / XP from the server
  const progress = useAuthStore((s) => s.progress);
  const [tab, setTab] = useState<SheetTab>('profile');

  // Pull the latest persisted stats whenever the sheet opens, so the record
  // reflects runs finished this session (the server's end-of-run DB write can
  // land just after returning to town).
  useEffect(() => {
    void useAuthStore.getState().refreshProgress();
  }, []);

  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  if (!me) return null;

  const characterClass: CharacterClass = me.characterClass;
  const def = getClassDefinition(characterClass);
  const record = progress.find((p) => p.characterClass === characterClass);

  const kills = record?.kills ?? me.kills;
  const deaths = record?.deaths ?? me.deaths;
  const wins = record?.wins ?? 0;
  const losses = record?.losses ?? 0;
  const kd = deaths === 0 ? kills.toFixed(2) : (kills / deaths).toFixed(2);
  const games = wins + losses;
  const winRate = games === 0 ? '—' : `${Math.round((wins / games) * 100)}%`;

  return (
    // The info panel, tabbed: Profile (vitals/abilities), Record (arena +
    // survival), and History (recent runs). A plain sidebar surface — no town
    // backdrop, no free-standing 3D champion — like the other menus.
    <div
      className={cn(
        PANEL_SURFACE,
        'flex h-[80vh] w-[min(38rem,calc(100vw-10rem))] min-w-0 flex-col',
      )}
    >
      <SidebarHeader icon={UserRound} title="Champion" onClose={onClose} />

        {/* Tabs — class Profile, lifetime Record, per-run History. */}
        <div className="flex gap-1 border-b border-white/10 px-5">
          <SheetTabButton active={tab === 'profile'} onClick={() => setTab('profile')}>
            Profile
          </SheetTabButton>
          <SheetTabButton active={tab === 'record'} onClick={() => setTab('record')}>
            Record
          </SheetTabButton>
          <SheetTabButton active={tab === 'history'} onClick={() => setTab('history')}>
            History
          </SheetTabButton>
        </div>

        {tab === 'profile' && (
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
            {/* Class vitals — health & mana, shown like the fighter select. */}
            <section>
              <SheetLabel>Class Profile</SheetLabel>
              <div className="mt-3">
                <ClassVitals def={def} />
              </div>
            </section>

            {/* Ability kit — each QWER ability explained inline (no hover needed),
                derived from the registry so the text never drifts. */}
            <section>
              <SheetLabel>Abilities</SheetLabel>
              <div className="mt-3 flex flex-col gap-2.5">
                {ABILITY_SLOTS.map((slot) => {
                  const kind = CLASS_LOADOUTS[characterClass][slot];
                  return kind ? <AbilityDetail key={slot} ability={kind} slot={slot} /> : null;
                })}
              </div>
            </section>
          </div>
        )}

        {tab === 'record' && (
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
            {/* Lifetime arena (PvP) record — crimson, like the duel altar. */}
            <section>
              <SheetLabel>Arena Record</SheetLabel>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                Your lifetime player-vs-player results. Hover any number for what it means.
              </p>
              <ArenaRecord
                kills={kills}
                deaths={deaths}
                kd={kd}
                wins={wins}
                losses={losses}
                winRate={winRate}
              />
            </section>

            {/* Lifetime survival (zombie) record — necrotic green, like the Breach. */}
            <section>
              <SheetLabel>Survival Record</SheetLabel>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                Your all-time co-op horde stats. Hover any number for what it means.
              </p>
              <SurvivalRecord stats={record?.zombie ?? EMPTY_ZOMBIE_STATS} />
            </section>
          </div>
        )}

        {tab === 'history' && <RunHistoryTab characterClass={characterClass} />}
    </div>
  );
}

/** A segmented tab button in the champion sheet header. */
function SheetTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-3 py-2.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] transition-colors',
        active
          ? 'border-gold text-gold'
          : 'border-transparent text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

/** The History tab: this class's recent arena + zombie runs, newest first. */
function RunHistoryTab({ characterClass }: { characterClass: CharacterClass }) {
  const token = useAuthStore((s) => s.token);
  // null = still loading; [] = loaded but empty.
  const [runs, setRuns] = useState<RunHistoryEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRuns(null);
    if (!token) {
      setRuns([]);
      return;
    }
    void fetchRunHistory(token, characterClass).then((r) => {
      if (alive) setRuns(r);
    });
    return () => {
      alive = false;
    };
  }, [token, characterClass]);

  if (runs === null) {
    return (
      <div className="flex flex-1 items-center justify-center py-10 text-xs text-muted">
        Loading history…
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <Skull size={22} className="text-muted/60" aria-hidden />
        <p className="text-sm text-muted">No runs recorded yet for this champion.</p>
        <p className="text-[11px] text-muted/70">
          Finish a ranked arena match or a survival run and it'll show up here.
        </p>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-4">
      {runs.map((run) => (
        <RunHistoryRow key={run.id} run={run} />
      ))}
    </div>
  );
}

/** One run in the history list — arena (PvP result) or zombie (wave reached). */
function RunHistoryRow({ run }: { run: RunHistoryEntry }) {
  const zombie = run.mode === 'zombie';
  const accent = zombie ? BREACH_ACCENT : ARENA_ACCENT;
  const Icon = zombie ? Skull : Swords;
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5"
      style={{ background: `color-mix(in srgb, ${accent} 7%, transparent)` }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }}
      >
        <Icon size={15} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-text">
            {zombie ? 'Survival' : 'Arena'}
          </span>
          {zombie ? (
            <span className="text-[13px] font-bold tabular-nums" style={{ color: accent }}>
              Wave {run.wave}
            </span>
          ) : (
            <span
              className="rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide"
              style={{
                color: run.outcome === 'win' ? STAT_COLORS.positive : STAT_COLORS.negative,
                background: `color-mix(in srgb, ${
                  run.outcome === 'win' ? STAT_COLORS.positive : STAT_COLORS.negative
                } 16%, transparent)`,
              }}
            >
              {run.outcome === 'win' ? 'Victory' : 'Defeat'}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted">
          {zombie
            ? `${fmtNum(run.kills)} zombies · ${fmtNum(run.xp)} XP`
            : `${run.kills} kills · ${run.deaths} deaths · ${fmtNum(run.xp)} XP`}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-[11px] font-medium tabular-nums text-text">
          {fmtDuration(run.durationSec)}
        </div>
        <div className="text-[10px] text-muted">{fmtWhen(run.endedAt)}</div>
      </div>
    </div>
  );
}

/** Epoch ms → a short relative/absolute time ("just now", "3h ago", "Jun 26"). */
function fmtWhen(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Seconds → a compact duration (`3h 12m`, `8m 04s`, `45s`). */
function fmtDuration(sec: number): string {
  if (sec <= 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Compact number (12300 → 12.3k). */
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

/** Brand accents pulled from the town shrines: the duel altar's battle-fury
 *  crimson and the Breach's necrotic rift-green. Used to theme each record card. */
const ARENA_ACCENT = '#ff4a35';
const BREACH_ACCENT = '#7fe04a';

/**
 * Lifetime arena (PvP) record — a crimson card echoing the duel altar's
 * battle-fury vortex. Wins lead; then losses + win-rate, and a combat row. Falling
 * to zombies never counts here (those deaths are excluded server-side).
 */
function ArenaRecord({
  kills,
  deaths,
  kd,
  wins,
  losses,
  winRate,
}: {
  kills: number;
  deaths: number;
  kd: string;
  wins: number;
  losses: number;
  winRate: string;
}) {
  const a = ARENA_ACCENT;
  const empty = wins === 0 && losses === 0 && kills === 0 && deaths === 0;
  return (
    <RecordCard
      accent={a}
      bgImage="/images/arena-bg.png"
      hero={<RecordHero icon={Trophy} value={fmtNum(wins)} label="Wins" accent={a} />}
      side={
        <div className="grid h-full grid-cols-1 gap-2">
          <RecordStat
            icon={Flag}
            label="Losses"
            value={fmtNum(losses)}
            accent={a}
            hint="Ranked arena matches your team lost."
          />
          <RecordStat
            icon={Percent}
            label="Win Rate"
            value={winRate}
            accent={a}
            hint="Share of your ranked arena matches that ended in a win."
          />
        </div>
      }
    >
      {empty ? (
        <div className="px-3 pb-3 pt-1 text-center text-[11px] text-muted">
          No arena matches yet — win a duel to start your record.
        </div>
      ) : (
        <>
          <Divider label="Combat" />
          <div className="grid grid-cols-3 gap-2 px-3 pb-3">
            <RecordStat
              icon={Swords}
              label="Kills"
              value={fmtNum(kills)}
              accent={a}
              hint="Enemy players you've defeated in arena (PvP) matches."
            />
            <RecordStat
              icon={Skull}
              label="Deaths"
              value={fmtNum(deaths)}
              accent={a}
              hint="Times you've been defeated by another player. Falling to zombies doesn't count here."
            />
            <RecordStat
              icon={Target}
              label="K/D"
              value={kd}
              accent={a}
              hint="Kills divided by deaths — your arena combat ratio. Higher is better."
            />
          </div>
        </>
      )}
    </RecordCard>
  );
}

/**
 * Lifetime zombie-survival record — a necrotic-green card echoing the Breach. Led
 * by the all-time Best Wave, then a kill breakdown by zombie type and objectives +
 * damage. All-zero classes get a gentle "no runs yet" hint instead of zeros.
 */
function SurvivalRecord({ stats }: { stats: ZombieClassStats }) {
  const a = BREACH_ACCENT;
  const totalKills =
    stats.killsNormal +
    stats.killsSprinter +
    stats.killsFat +
    stats.killsMiniboss +
    stats.killsTitan;

  return (
    <RecordCard
      accent={a}
      bgImage="/images/zombie-bg.png"
      hero={<RecordHero icon={Trophy} value={fmtNum(stats.bestWave)} label="Best Wave" accent={a} />}
      side={
        <div className="grid h-full grid-cols-2 gap-2">
          <RecordStat
            icon={Skull}
            label="Runs"
            value={fmtNum(stats.runs)}
            accent={a}
            hint="Survival runs you've played on this class."
          />
          <RecordStat
            icon={Timer}
            label="Time"
            value={fmtDuration(stats.timeSurvived)}
            accent={a}
            hint="Total time you've survived across all runs."
          />
          <RecordStat
            icon={Crown}
            label="Bosses"
            value={fmtNum(stats.killsMiniboss)}
            accent={a}
            hint="Mini-bosses slain — the elite enemy that appears every few waves."
          />
          <RecordStat
            icon={Flame}
            label="Titans"
            value={fmtNum(stats.killsTitan)}
            accent={a}
            hint="Necrotic Titans slain — the massive boss from wave 16 onward."
          />
        </div>
      }
    >
      {stats.runs === 0 ? (
        <div className="px-3 pb-3 pt-1 text-center text-[11px] text-muted">
          No survival runs yet — survive a wave to start your record.
        </div>
      ) : (
        <>
          {/* Kills by zombie type */}
          <Divider label={`Kills · ${fmtNum(totalKills)}`} />
          <div className="grid grid-cols-3 gap-2 px-3 pb-1">
            <RecordStat
              icon={Skull}
              label="Walkers"
              value={fmtNum(stats.killsNormal)}
              accent={a}
              hint="Standard zombies killed — the bulk of the horde."
            />
            <RecordStat
              icon={Rabbit}
              label="Sprinters"
              value={fmtNum(stats.killsSprinter)}
              accent={a}
              hint="Fast, fragile zombies killed — they rush you but die quickly."
            />
            <RecordStat
              icon={Shield}
              label="Brutes"
              value={fmtNum(stats.killsFat)}
              accent={a}
              hint="Tanky, slow zombies killed — high health, heavy hits."
            />
          </div>

          {/* Objectives + damage */}
          <Divider label="Feats" />
          <div className="grid grid-cols-3 gap-2 px-3 pb-3">
            <RecordStat
              icon={Sparkles}
              label="Perks"
              value={fmtNum(stats.perksPicked)}
              accent={a}
              hint="Roguelite perks you've chosen between waves to power up your run."
            />
            <RecordStat
              icon={Gem}
              label="Altars"
              value={fmtNum(stats.altars)}
              accent={a}
              hint="Resonance rituals you've completed to claim the altar superweapon."
            />
            <RecordStat
              icon={DoorOpen}
              label="Doors"
              value={fmtNum(stats.doors)}
              accent={a}
              hint="Sealed sections opened by clearing waves — the arena grows as you push on."
            />
            <RecordStat
              icon={Bomb}
              label="Traps"
              value={fmtNum(stats.traps)}
              accent={a}
              hint="Trap zones you've triggered against the horde (heal, fire, singularity…)."
            />
            <RecordStat
              icon={Swords}
              label="Dmg Dealt"
              value={fmtNum(stats.damageDealt)}
              accent={a}
              hint="Total damage you've dealt to zombies across all runs."
            />
            <RecordStat
              icon={Zap}
              label="Dmg Taken"
              value={fmtNum(stats.damageTaken)}
              accent={a}
              hint="Total damage you've taken across all runs."
            />
          </div>
        </>
      )}
    </RecordCard>
  );
}

/** A themed record-card shell: an accent-tinted frame with a hero band (big stat +
 *  side cells) over optional extra rows. An optional `bgImage` is laid in behind
 *  the content (under a dark accent wash) for a bit of atmosphere. Shared by the
 *  arena + survival records. */
function RecordCard({
  accent,
  hero,
  side,
  children,
  bgImage,
}: {
  accent: string;
  hero: ReactNode;
  side: ReactNode;
  children?: ReactNode;
  bgImage?: string;
}) {
  return (
    <div
      className="relative mt-3 overflow-hidden rounded-xl border"
      style={{
        borderColor: `color-mix(in srgb, ${accent} 32%, transparent)`,
        background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 13%, transparent), color-mix(in srgb, ${accent} 3%, transparent))`,
      }}
    >
      {bgImage && (
        <>
          {/* Atmospheric art, then a dark accent wash so the stats stay legible. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${bgImage})`, opacity: 0.28 }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 16%, rgba(8,12,8,0.55)), rgba(6,10,6,0.82))`,
            }}
          />
        </>
      )}
      <div className="relative">
        <div className="flex items-stretch gap-3 p-3">
          {hero}
          <div className="flex-1">{side}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The big headline stat in a record card (icon + large accent numeral + label). */
function RecordHero({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof Skull;
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div className="flex min-w-30 flex-col items-center justify-center rounded-lg bg-black/30 px-4 py-3">
      <Icon size={16} style={{ color: accent }} aria-hidden />
      <div
        className="mt-1 font-display text-4xl font-black leading-none tabular-nums"
        style={{ color: accent, textShadow: `0 0 18px color-mix(in srgb, ${accent} 45%, transparent)` }}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted">{label}</div>
    </div>
  );
}

/** One stat cell: an accent icon, a value, and a tiny caption. The `hint`
 *  surfaces as a hover tooltip explaining what the stat is. */
function RecordStat({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Skull;
  label: string;
  value: string;
  hint: string;
  accent: string;
}) {
  return (
    <div
      className="flex cursor-help items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5"
      title={hint}
    >
      <Icon size={14} className="shrink-0" style={{ color: accent }} aria-hidden />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-bold leading-tight tabular-nums text-text">
          {value}
        </div>
        <div className="text-[9px] uppercase tracking-wide text-muted">{label}</div>
      </div>
    </div>
  );
}

/** A thin labelled divider inside a record card. */
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pb-2 pt-1">
      <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

/** An ability explained inline: an iconed gold medallion (with its QWER key), the
 *  aim/cost/cooldown chips, and a plain-English effect breakdown — all derived from
 *  the registry via `describeAbility`, so it never drifts from what the ability does. */
function AbilityDetail({ ability, slot }: { ability: AbilityKind; slot: AbilitySlot }) {
  const t = describeAbility(ABILITIES[ability]);
  const Icon = ABILITY_ICON[ability];
  return (
    <div className="rounded-xl border border-gold/15 bg-black/20 p-3">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-linear-to-b from-gold/20 to-gold/5 text-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <Icon size={18} aria-hidden="true" />
          <span className="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-md border border-gold/50 bg-bg text-[10px] font-bold leading-none text-gold shadow-sm">
            {slot}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-text">{t.name}</div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-gold/70">{t.aimLabel}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <AbilityChip label="CD" value={`${(t.cooldownMs / 1000).toFixed(t.cooldownMs % 1000 ? 1 : 0)}s`} />
          <AbilityChip label="Mana" value={String(t.manaCost)} accent />
          {t.castTimeMs > 0 && <AbilityChip label="Cast" value={`${(t.castTimeMs / 1000).toFixed(1)}s`} />}
          {t.range > 0 && <AbilityChip label="Range" value={String(t.range)} />}
        </div>
      </div>
      <ul className="mt-2.5 space-y-1">
        {t.lines.map((line, i) => (
          <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-muted">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gold/70" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A tiny stat chip (CD / Mana / Cast / Range) for an ability card. */
function AbilityChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5">
      <span className="text-[9px] uppercase tracking-wide text-muted">{label}</span>
      <span
        className="text-[11px] font-semibold tabular-nums"
        style={{ color: accent ? STAT_COLORS.mana : STAT_COLORS.text }}
      >
        {value}
      </span>
    </div>
  );
}

/** A small gold section label for the sheet's right column. */
function SheetLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-gold/80">
      <span className="h-px w-5 bg-linear-to-r from-gold/70 to-transparent" />
      {children}
    </h3>
  );
}
