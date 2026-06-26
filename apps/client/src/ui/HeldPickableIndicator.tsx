import { useEffect, useRef, useState } from 'react';
import { Bomb, Flame, HeartPulse, type LucideIcon } from 'lucide-react';
import { PICKABLES, isPickableKind, type PickableKind } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';

/** Per-pickable icon + accent color (border / glow), mirroring the perk slots. */
const PICKABLE_LOOK: Record<PickableKind, { Icon: LucideIcon; color: string; glow: string }> = {
  molotov: { Icon: Flame, color: '#ff8a2a', glow: 'rgba(255,138,42,0.45)' },
  grenade: { Icon: Bomb, color: '#a3b18a', glow: 'rgba(163,177,138,0.4)' },
  heal_pack: { Icon: HeartPulse, color: '#22c55e', glow: 'rgba(34,197,94,0.4)' },
};

/**
 * Held-pickable indicator: a single icon slot (styled like {@link PerkBar}'s perk
 * slots) shown to the RIGHT of the ability bar while the local player is carrying
 * a thrown object (molotov / grenade). Hovering reveals a tooltip naming it.
 *
 * Driven imperatively off the game store's snapshot (the `players` map is
 * non-reactive), re-rendering only when the held kind actually changes — same
 * pattern as the perk bar.
 */
export function HeldPickableIndicator() {
  const [holding, setHolding] = useState('');
  const prev = useRef('');

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const { sessionId, players } = useGameStore.getState();
      const me = sessionId ? players.get(sessionId) : undefined;
      const held = me?.holding ?? '';
      if (held !== prev.current) {
        prev.current = held;
        setHolding(held);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const [hover, setHover] = useState(false);
  if (!isPickableKind(holding)) return null;

  const def = PICKABLES[holding];
  const { Icon, color, glow } = PICKABLE_LOOK[holding];
  const throwable = def.throwRange > 0;

  return (
    <div className="pointer-events-none flex items-center">
      <div
        className="pointer-events-auto relative cursor-default"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg border bg-black/60 backdrop-blur-sm transition-transform hover:scale-110"
          style={{ borderColor: color, boxShadow: `0 0 8px ${glow}` }}
        >
          <Icon size={20} style={{ color }} />
        </div>
        {hover && (
          <div
            className="absolute bottom-full left-1/2 z-50 mb-2 w-44 -translate-x-1/2 rounded-lg border border-white/15 bg-black/90 px-3 py-2 text-center backdrop-blur-md"
            style={{ boxShadow: `0 0 12px ${glow}` }}
          >
            <span className="block text-xs font-bold" style={{ color }}>
              Holding: {def.name}
            </span>
            {throwable && (
              <span className="block text-[11px] leading-tight text-white/60">
                Press Space to throw
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
