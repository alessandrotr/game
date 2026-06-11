import { useEffect, useState } from 'react';

/**
 * Stays `true` for at least `ms` after first mount, then flips to `false`.
 * Used to floor the intro loading screen so it reads as a deliberate splash
 * even when token restore resolves instantly.
 */
export function useMinimumDuration(ms: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return !elapsed; // true === still within the minimum window
}
