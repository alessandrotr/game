import { ABILITIES, type AbilityKind, type AbilitySlot } from '@arena/shared';
import { ABILITY_ICON } from './abilityIcons';
import { AbilityHover } from './AbilityTooltipCard';

/**
 * An ability medallion — a gold icon tile tagged with its QWER key + name, that
 * lifts/glows on hover and reveals the full effect tooltip (via {@link AbilityHover},
 * derived from the registry so it never drifts from the real mechanics). Shared by
 * the character-select roster and the champion sheet so an ability reads identically
 * in both. Pass `slot` to show the bound key (and surface it in the tooltip header).
 */
export function AbilityBadge({ ability, slot }: { ability: AbilityKind; slot?: AbilitySlot }) {
  const Icon = ABILITY_ICON[ability];
  return (
    <AbilityHover
      ability={ability}
      slot={slot}
      tapToShow
      className="group flex w-18 cursor-pointer select-none flex-col items-center gap-1.5"
    >
      <span className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-gold/40 bg-linear-to-b from-gold/20 to-gold/6 text-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-gold group-hover:from-gold/30 group-hover:shadow-[0_0_18px_rgba(200,162,74,0.4)]">
        <Icon size={20} aria-hidden="true" />
        {slot && (
          <span className="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-md border border-gold/50 bg-bg text-[10px] font-bold leading-none text-gold shadow-sm">
            {slot}
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-[9px] font-medium uppercase tracking-wider text-muted transition-colors group-hover:text-gold/90">
        {ABILITIES[ability].name}
      </span>
    </AbilityHover>
  );
}
