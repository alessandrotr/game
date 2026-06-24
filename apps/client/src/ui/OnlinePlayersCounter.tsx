import { useEffect, useRef, useState } from 'react';
import { fetchOnlineCount } from '../network/auth';

/** How often to refresh the live count while the login screen is open. */
const POLL_MS = 20000;
/** Count-up tween duration when the number changes, in ms. */
const TWEEN_MS = 700;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/**
 * Smoothly tween a displayed integer toward `target` whenever it changes — the
 * classy "rolling count" instead of a hard jump. Returns the current value.
 */
function useCountUp(target: number | null): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (target === null) return;
    fromRef.current = value;
    startRef.current = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / TWEEN_MS);
      setValue(Math.round(fromRef.current + (target - fromRef.current) * easeOut(t)));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // Re-run only when the target changes (value is a ref-like seed here).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

/**
 * A quiet, classy "players online" line for the login screen — a softly pulsing
 * gold presence dot and a count that rolls up when it changes. Polls `/online`,
 * stays mounted across auth tabs, and fades in once the first count lands (so a
 * server hiccup never shows a broken "0 online").
 */
export function OnlinePlayersCounter({ className }: { className?: string }) {
  const [count, setCount] = useState<number | null>(null);
  const display = useCountUp(count);

  useEffect(() => {
    let active = true;
    const tick = () =>
      void fetchOnlineCount().then((n) => {
        if (active) setCount(n);
      });
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div
      className={`flex items-center gap-2.5 transition-opacity duration-700 ${
        count === null ? 'opacity-0' : 'opacity-100'
      } ${className ?? 'justify-center'}`}
      role="status"
      aria-live="polite"
    >
      {/* Soft gold presence dot — a slow, gentle pulse (no loud ping). */}
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-gold/60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold shadow-[0_0_6px_rgba(200,162,74,0.8)]" />
      </span>
      <p className="text-[13px] text-muted">
        <span className="font-semibold tabular-nums text-text">{display.toLocaleString()}</span>{' '}
        playing now
      </p>
    </div>
  );
}
