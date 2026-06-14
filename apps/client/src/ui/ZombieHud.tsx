import { Skull } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { HudZone } from './hud/HudLayout';

/**
 * Zombie-survival wave HUD: a top-center banner showing the current level and
 * how many zombies are left to clear it. Self-gates on `zombieMode`, so it's
 * inert (renders nothing) in every other room. Between hordes — when the level
 * has spawned but nothing's left — it reads as the next horde incoming.
 */
export function ZombieHud() {
  const zombieMode = useGameStore((s) => s.zombieMode);
  const level = useGameStore((s) => s.zombieLevel);
  const remaining = useGameStore((s) => s.zombiesRemaining);
  const alive = useGameStore((s) => s.zombiesAlive);

  if (!zombieMode) return null;

  // Level 0 = pre-game grace; remaining 0 mid-mode = the cleared-level breather.
  const warming = level === 0;
  const breather = !warming && remaining === 0;

  return (
    <HudZone zone="top-center">
      <div className="pointer-events-none flex flex-col items-center gap-1">
        <div className="flex items-center gap-2 rounded-full border border-[#3a7d1f]/70 bg-black/65 px-4 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
          <Skull size={16} className="text-[#a6ff7f]" aria-hidden="true" />
          <span className="font-display text-sm font-bold uppercase tracking-wider text-[#a6ff7f]">
            {warming ? 'Brace yourself…' : `Level ${level}`}
          </span>
        </div>
        <div className="rounded bg-black/55 px-3 py-0.5 text-xs font-semibold tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
          {warming
            ? 'First horde incoming'
            : breather
              ? `Level ${level + 1} incoming…`
              : `Zombies left: ${remaining}` + (alive > 0 ? ` (${alive} closing in)` : '')}
        </div>
      </div>
    </HudZone>
  );
}
