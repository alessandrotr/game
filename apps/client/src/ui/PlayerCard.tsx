import { getClassDefinition, xpForLevel } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';

/** A compact labelled bar (HP / MP). */
function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-[10px] font-semibold text-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/45">
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${ratio * 100}%`, background: color }}
        />
      </div>
      <span className="w-9 text-right text-[11px] tabular-nums text-white/80">{Math.round(value)}</span>
    </div>
  );
}

/** A single stat tile (kills / deaths / K/D). */
function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg bg-black/30 py-1.5">
      <div className="text-[15px] font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

/**
 * Modern player card (Phase 14 UI): level badge, an XP-to-next-level bar, and
 * career K/D — all from the replicated, DB-backed progression. HP/MP show only
 * in the arena. Refreshes each tick so it tracks the server live.
 */
export function PlayerCard() {
  const sessionId = useGameStore((s) => s.sessionId);
  const inArena = useGameStore((s) => s.room) === 'arena';
  useGameStore((s) => s.tick); // re-render ~20×/s so stats track the server
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  if (!me) return null;

  const def = getClassDefinition(me.characterClass);
  const levelStart = xpForLevel(me.level);
  const levelEnd = xpForLevel(me.level + 1);
  const span = Math.max(1, levelEnd - levelStart);
  const into = Math.max(0, Math.min(span, me.xp - levelStart));
  const xpPct = (into / span) * 100;
  const kd = me.deaths > 0 ? (me.kills / me.deaths).toFixed(2) : me.kills.toFixed(2);

  return (
    <div className="pointer-events-none absolute left-4 top-4 w-64 overflow-hidden rounded-2xl border border-white/10 bg-panel/85 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
      {/* Class-tinted header strip */}
      <div
        className="flex items-center gap-3 px-3 py-3"
        style={{ background: `linear-gradient(90deg, ${def.color}26, transparent)` }}
      >
        {/* Level badge */}
        <div
          className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border"
          style={{ borderColor: def.color, background: `${def.color}1f`, boxShadow: `0 0 14px ${def.color}55` }}
        >
          <span className="text-[9px] font-semibold uppercase tracking-wider text-white/60">Lvl</span>
          <span className="text-lg font-bold leading-none" style={{ color: def.color }}>
            {me.level}
          </span>
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] tracking-wide text-white">{me.name}</div>
          <div className="truncate text-[11px] text-muted">{def.name} · {def.role}</div>
        </div>
      </div>

      <div className="px-3 pb-3 pt-2">
        {/* XP bar */}
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted">XP</span>
          <span className="text-[10px] tabular-nums text-white/60">
            {Math.round(into)} / {span}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/45">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${xpPct}%`, background: `linear-gradient(90deg, ${def.color}, #ffffffcc)` }}
          />
        </div>

        {/* Career stats */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Kills" value={me.kills} color="#5fe08a" />
          <Stat label="Deaths" value={me.deaths} color="#ff7a7a" />
          <Stat label="K/D" value={kd} color="#e6e9f5" />
        </div>

        {/* Vitals — combat only */}
        {inArena && (
          <div className="mt-3 space-y-1.5">
            <Bar label="HP" value={me.hp} max={me.maxHp} color="#4ade80" />
            <Bar label="MP" value={me.mana} max={me.maxMana} color="#60a5fa" />
            {!me.alive && (
              <div className="pt-0.5 text-center text-[11px] font-semibold text-red-400">
                Defeated — respawning…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
