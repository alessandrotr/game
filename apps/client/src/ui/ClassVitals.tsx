import { Heart, Droplet, type LucideIcon } from 'lucide-react';
import type { ClassDefinition } from '@arena/shared';
import { STAT_COLORS } from './theme';

/** One big vital readout — a glowing colored numeral with its icon medallion
 *  beside it, centred in its half. Scales down a step on small screens. */
function Vital({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] uppercase tracking-[0.25em] text-muted">{label}</span>
      {/* The number is centred in its half; the icon is absolutely positioned to
          its left so it never shifts the numeral off-centre. */}
      <span className="relative flex items-center justify-center">
        <span
          className="absolute right-full mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10"
          style={{ background: `radial-gradient(circle at center, ${color}33, transparent 72%)` }}
        >
          <Icon aria-hidden="true" className="h-5 w-5 sm:h-6 sm:w-6" style={{ color }} />
        </span>
        <span
          className="font-display text-3xl leading-none tabular-nums sm:text-4xl"
          style={{ color, textShadow: `0 0 20px ${color}66` }}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

/** The two numbers that define a class — health on the left, mana on the right,
 *  big and side-by-side over a hairline divider. Clearer than two tiny bars for two
 *  values. Shared by the fighter select and the champion sheet. */
export function ClassVitals({ def }: { def: ClassDefinition }) {
  return (
    <div className="relative grid grid-cols-2 items-start gap-2 py-1 sm:gap-3">
      <span className="pointer-events-none absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-linear-to-b from-transparent via-white/15 to-transparent" />
      <Vital icon={Heart} label="Health" value={def.stats.health} color={STAT_COLORS.positive} />
      <Vital icon={Droplet} label="Mana" value={def.stats.mana} color={STAT_COLORS.mana} />
    </div>
  );
}
