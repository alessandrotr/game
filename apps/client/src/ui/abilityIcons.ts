import {
  Bomb,
  Crosshair,
  Flame,
  Footprints,
  Heart,
  HeartPulse,
  Shield,
  Skull,
  Snail,
  Snowflake,
  Sparkles,
  Sun,
  Swords,
  Target,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { ABILITIES, type AbilityKind } from '@arena/shared';

/**
 * Lucide glyphs by name. Each ability declares its `icon` (a key here) in the
 * registry, so adding an ability needs no edit here unless it introduces a new
 * glyph — add that one line and you're done. Shared by the action bar and the
 * character-select panel so an ability reads the same everywhere.
 */
const ICON_BY_NAME: Record<string, LucideIcon> = {
  Flame,
  HeartPulse,
  Snowflake,
  Sparkles,
  Waves,
  Zap,
  Swords,
  Wind,
  Shield,
  Bomb,
  Crosshair,
  Snail,
  Footprints,
  Target,
  Sun,
  Heart,
  Skull,
};

/** A safe fallback when an ability's icon name isn't mapped yet. */
const FALLBACK_ICON: LucideIcon = Sparkles;

/** Resolve the glyph for an ability via its registry `icon` name. */
export function abilityIcon(kind: AbilityKind): LucideIcon {
  return ICON_BY_NAME[ABILITIES?.[kind]?.icon ?? ''] ?? FALLBACK_ICON;
}

/**
 * Back-compat icon map keyed by ability id (built dynamically via Proxy). Existing
 * consumers (`ABILITY_ICON[kind]`) keep working; new abilities appear here
 * automatically, completely avoiding circular import issues at startup.
 */
export const ABILITY_ICON: Record<AbilityKind, LucideIcon> = new Proxy({} as any, {
  get(_target, prop) {
    if (typeof prop === 'string') {
      return abilityIcon(prop as AbilityKind);
    }
    return undefined;
  },
});

