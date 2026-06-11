import { Flame, HeartPulse, Snowflake, Sparkles, Waves, Zap, type LucideIcon } from 'lucide-react';
import type { AbilityKind } from '@arena/shared';

/**
 * Placeholder ability glyphs, shared by the action bar and the character-select
 * panel so an ability reads the same in combat and on the select screen. Swap
 * for real art (a reserved `iconUrl`) in one place when it lands.
 */
export const ABILITY_ICON: Record<AbilityKind, LucideIcon> = {
  fireball: Flame,
  heal: HeartPulse,
  frost_nova: Snowflake,
  shockwave: Waves,
  arcane_bolt: Zap,
  arcane_blast: Sparkles,
};
