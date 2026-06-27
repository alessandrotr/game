import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { CosmeticRarity } from '@arena/shared';
import { useUnlockToastStore, type UnlockToast as UnlockToastItem } from '../store/useUnlockToastStore';

/** How long each unlock toast stays on screen, in milliseconds. */
const VISIBLE_MS = 3000;

/** Rarity accent — matches the store's rarity palette. */
const RARITY_COLOR: Record<CosmeticRarity, string> = {
  common: '#9aa3b8',
  rare: '#4a8bff',
  epic: '#9a6cff',
  legendary: '#e8b24a',
};

/**
 * Stack of "Unlocked!" toasts, bottom-center. Pops a gold flourish naming each
 * cosmetic the moment it's claimed in the wardrobe, then auto-dismisses. Sits at
 * `z-toast`, above the store's backdrop, so it reads even with the hub open.
 */
export function UnlockToast() {
  const items = useUnlockToastStore((s) => s.items);
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-toast flex flex-col items-center gap-2">
      {items.map((t) => (
        <UnlockToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}

function UnlockToastCard({ item }: { item: UnlockToastItem }) {
  const dismiss = useUnlockToastStore((s) => s.dismiss);
  const [shown, setShown] = useState(false);
  const color = RARITY_COLOR[item.rarity];

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const id = setTimeout(() => dismiss(item.id), VISIBLE_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(id);
    };
  }, [item.id, dismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 rounded-2xl border border-gold/40 bg-panel/90 px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all duration-300 ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      }`}
      style={{ boxShadow: `0 0 24px ${color}33, 0 12px 40px rgba(0,0,0,0.5)` }}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={{ background: `${color}26`, color }}
      >
        <Sparkles size={18} aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Unlocked</div>
        <div className="truncate text-sm font-semibold text-text">{item.name}</div>
      </div>
    </div>
  );
}
