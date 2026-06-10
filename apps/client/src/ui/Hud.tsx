import { useGameStore } from '../store/useGameStore';
import { ActionBar } from './ActionBar';

/** A labelled stat bar (HP/mana). */
function StatBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="my-1 flex items-center gap-2">
      <span className="w-6 text-muted">{label}</span>
      <div className="h-2 w-[120px] overflow-hidden rounded bg-black/40">
        <div
          className="h-full rounded transition-[width] duration-100"
          style={{ width: `${ratio * 100}%`, background: color }}
        />
      </div>
      <span className="w-7 text-right tabular-nums">{Math.round(value)}</span>
    </div>
  );
}

/** In-game heads-up display: your vitals, player count, and controls. */
export function Hud() {
  const playerIds = useGameStore((s) => s.playerIds);
  const sessionId = useGameStore((s) => s.sessionId);
  // Subscribing to `tick` re-renders ~20×/s so vitals track the server.
  useGameStore((s) => s.tick);
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;

  return (
    <>
      <div className="pointer-events-none absolute left-4 top-4 rounded-[10px] border border-accent/20 bg-panel/85 px-4 py-3 text-[13px] leading-relaxed">
        <div>
          <span className="text-muted">Name:</span> {me?.name ?? '—'}
        </div>
        {me && (
          <>
            <StatBar label="HP" value={me.hp} max={me.maxHp} color="#4ade80" />
            <StatBar label="MP" value={me.mana} max={me.maxMana} color="#60a5fa" />
          </>
        )}
        {me && !me.alive && <div className="mt-1 font-semibold text-red-400">Defeated — respawning…</div>}
        <div>
          <span className="text-muted">Players:</span> {playerIds.length}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-[92px] left-1/2 -translate-x-1/2 text-xs tracking-wide text-muted">
        Hold right-click to move · Space jump · Q W E R abilities · F talk
      </div>
      <ActionBar />
    </>
  );
}
