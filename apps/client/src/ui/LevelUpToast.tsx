import { useEffect, useState } from 'react';
import { useLevelUpStore } from '../store/useLevelUpStore';

/** How long the banner stays on screen, in milliseconds. */
const VISIBLE_MS = 2600;

/**
 * Local-player level-up banner. Pops a gold "LEVEL UP" flourish in the upper
 * third of the screen when the server reports the local player gained a level,
 * then auto-dismisses. Keyed off the store's `nonce` so back-to-back level-ups
 * re-trigger the animation.
 */
export function LevelUpToast() {
  const level = useLevelUpStore((s) => s.level);
  const nonce = useLevelUpStore((s) => s.nonce);
  const clear = useLevelUpStore((s) => s.clear);
  const [shownNonce, setShownNonce] = useState(0);

  useEffect(() => {
    if (level === null) return;
    setShownNonce(nonce);
    const id = setTimeout(clear, VISIBLE_MS);
    return () => clearTimeout(id);
  }, [level, nonce, clear]);

  if (level === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-[22%] z-40 -translate-x-1/2"
    >
      <div
        key={shownNonce}
        className="animate-[levelup_2.6s_ease-out_forwards] flex flex-col items-center text-center"
      >
        <div
          className="font-display text-4xl font-extrabold tracking-[0.2em] text-gold"
          style={{ textShadow: '0 0 24px rgba(255,215,97,0.7), 0 2px 6px rgba(0,0,0,0.6)' }}
        >
          LEVEL UP
        </div>
        <div className="mt-1 text-base font-semibold text-text/90">Level {level}</div>
      </div>
    </div>
  );
}
