import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Resolve a Lucide icon component by its PascalCase name (stored in the perk
 * catalog as e.g. `'Heart'`, `'ShieldPlus'`). Falls back to `CircleDot` for
 * unknown names so the UI never crashes.
 */
export function resolvePerkIcon(name: string): LucideIcon {
  const icon = (LucideIcons as Record<string, unknown>)[name];
  if (typeof icon === 'function') return icon as LucideIcon;
  return LucideIcons.CircleDot;
}
