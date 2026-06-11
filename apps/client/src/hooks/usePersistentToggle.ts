import { useCallback, useState } from 'react';

/**
 * A boolean state mirrored to `localStorage` (as "1"/"0") so a UI preference —
 * e.g. a collapsed panel — survives reloads. Falls back to `initial` when the
 * key is unset or storage is unavailable (private mode, blocked, etc.).
 */
export function usePersistentToggle(
  key: string,
  initial: boolean,
): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : stored === '1';
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(key, next ? '1' : '0');
      } catch {
        /* storage blocked — the value only lasts this session */
      }
    },
    [key],
  );

  return [value, set];
}
