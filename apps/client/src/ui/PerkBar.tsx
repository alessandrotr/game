import { useEffect, useRef, useState } from 'react';
import { PERKS, type PerkId } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { resolvePerkIcon } from './perkIcons';

/** Tier → border/glow color for the active perk icon slot. */
const TIER_BORDER: Record<string, string> = {
  common: '#9ca3af',
  rare: '#60a5fa',
  legendary: '#fbbf24',
};

const TIER_GLOW: Record<string, string> = {
  common: 'rgba(156,163,175,0.25)',
  rare: 'rgba(96,165,250,0.35)',
  legendary: 'rgba(251,191,36,0.4)',
};

/**
 * Active perk bar: 3 small icon slots to the left of the ability bar, showing
 * the player's current perks. Empty slots are dim outlines. Each filled slot
 * has a tier-colored border and a hover tooltip.
 *
 * Driven imperatively (reads from the game store's imperative snapshot) to
 * avoid per-frame React re-renders — only re-renders when the set of active
 * perk ids actually changes.
 */
export function PerkBar() {
  const gunMode = useGameStore((s) => s.gunMode);
  const [perks, setPerks] = useState<[string, string, string]>(['', '', '']);
  const prev = useRef('');

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const { sessionId, players } = useGameStore.getState();
      const me = sessionId ? players.get(sessionId) : undefined;
      const p1 = me?.perk1 ?? '';
      const p2 = me?.perk2 ?? '';
      const p3 = me?.perk3 ?? '';
      const sig = `${p1}|${p2}|${p3}`;
      if (sig !== prev.current) {
        prev.current = sig;
        setPerks([p1, p2, p3]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Gun mode has no ability/perk kit. Otherwise show whenever the player holds a
  // perk — that's zombie waves normally, or a dev-granted perk in the FFA arena.
  if (gunMode) return null;
  const anyPerk = perks.some((p) => !!p);
  if (!anyPerk) return null;

  return (
    <div className="pointer-events-none flex items-center gap-1.5">
      {perks.map((perkId, i) => (
        <PerkSlot key={i} perkId={perkId as PerkId | ''} />
      ))}
    </div>
  );
}

function PerkSlot({ perkId }: { perkId: PerkId | '' }) {
  const [hover, setHover] = useState(false);
  if (!perkId || !(perkId in PERKS)) {
    return (
      <div className="h-10 w-10 rounded-lg border border-dashed border-white/15 bg-black/30" />
    );
  }

  const perk = PERKS[perkId as PerkId];
  const Icon = resolvePerkIcon(perk.icon);
  const borderColor = TIER_BORDER[perk.tier] ?? TIER_BORDER.common;
  const glowColor = TIER_GLOW[perk.tier] ?? TIER_GLOW.common;

  return (
    <div
      className="pointer-events-auto relative cursor-default"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg border bg-black/60 backdrop-blur-sm transition-transform hover:scale-110"
        style={{
          borderColor,
          boxShadow: `0 0 8px ${glowColor}`,
        }}
      >
        <Icon size={20} style={{ color: borderColor }} />
      </div>
      {hover && (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-2 w-44 -translate-x-1/2 rounded-lg border border-white/15 bg-black/90 px-3 py-2 text-center backdrop-blur-md"
          style={{ boxShadow: `0 0 12px ${glowColor}` }}
        >
          <span className="block text-xs font-bold" style={{ color: borderColor }}>
            {perk.name}
          </span>
          <span className="block text-[11px] leading-tight text-white/60">{perk.description}</span>
        </div>
      )}
    </div>
  );
}
