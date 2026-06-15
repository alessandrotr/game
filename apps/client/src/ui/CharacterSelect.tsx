import { Heart, Droplet, type LucideIcon } from 'lucide-react';
import {
  CLASS_LIST,
  classCosmeticsOf,
  getClassDefinition,
  type AbilityKind,
  type ClassDefinition,
} from '@arena/shared';
import { useCharacterStore } from '../store/useCharacterStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCosmeticsStore } from '../store/useCosmeticsStore';
import { ClassPreview } from './ClassPreview';
import { Badge, Card, LevelBadge, Meter } from './primitives';
import { ABILITY_ICON } from './abilityIcons';
import { AbilityHover } from './AbilityTooltipCard';

/** Comparison stats, in display order: icon + label + normalizing upper bound. */
const STATS: {
  stat: keyof ClassDefinition['stats'];
  label: string;
  icon: LucideIcon;
  max: number;
}[] = [
  { stat: 'health', label: 'Health', icon: Heart, max: 160 },
  { stat: 'mana', label: 'Mana', icon: Droplet, max: 150 },
];

/** Title-case a snake_case ability id ("frost_nova" → "Frost Nova"). */
const titleCase = (s: string) =>
  s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** A small section heading with a UO-style fading gold rule. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-4 flex items-center gap-2.5">
      <span className="font-display text-[10px] uppercase tracking-[0.25em] text-gold/70">
        {children}
      </span>
      <span className="h-px flex-1 bg-linear-to-r from-gold/25 to-transparent" />
    </div>
  );
}

/** One comparison stat: icon + label, normalized bar, value. */
function StatRow({
  icon: Icon,
  label,
  value,
  max,
  color,
}: (typeof STATS)[number] & { value: number; color: string }) {
  return (
    <Meter
      value={value}
      max={max}
      fill={color}
      label={
        <span className="flex items-center gap-1.5">
          <Icon size={13} aria-hidden="true" className="shrink-0 text-gold/60" />
          {label}
        </span>
      }
      valueText={value}
      className="text-xs"
      labelClassName="w-[88px]"
      valueClassName="w-8"
    />
  );
}

function ClassInfo({ def }: { def: ClassDefinition }) {
  return (
    <Card variant="inset">
      {/* Flavor / lore line. */}
      <p className="border-l-2 border-gold/30 pl-3 text-[13px] italic leading-relaxed text-muted">
        {def.description}
      </p>

      <SectionLabel>Stats</SectionLabel>
      <div className="flex flex-col gap-2">
        {STATS.map((s) => (
          <StatRow key={s.stat} {...s} value={def.stats[s.stat]} color="var(--color-gold)" />
        ))}
      </div>

      <SectionLabel>Abilities</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {def.abilities.map((ability) => (
          <AbilityBadge key={ability} ability={ability} />
        ))}
      </div>
    </Card>
  );
}

/** An ability chip that reveals its full tooltip (effects + values) on hover. */
function AbilityBadge({ ability }: { ability: AbilityKind }) {
  const Icon = ABILITY_ICON[ability];
  return (
    <AbilityHover ability={ability}>
      <Badge variant="gold" className="gap-1.5 normal-case">
        <Icon size={12} aria-hidden="true" />
        {titleCase(ability)}
      </Badge>
    </AbilityHover>
  );
}

/** Class cards (gold-accented) + the selected class's stats/abilities. Each card
 *  shows the account's level on that class (from persisted progression). */
export function CharacterSelect() {
  const selected = useCharacterStore((s) => s.selectedClass);
  const setSelected = useCharacterStore((s) => s.setSelectedClass);
  const progress = useAuthStore((s) => s.progress);
  const byClass = useCosmeticsStore((s) => s.byClass);
  const def = getClassDefinition(selected);

  // Level reached per class (classes never played default to 1).
  const levelByClass = new Map(progress.map((p) => [p.characterClass, p.level]));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {CLASS_LIST.map((c) => {
          const isSelected = c.id === selected;
          const level = levelByClass.get(c.id) ?? 1;
          // Each card shows that class's own equipped look (skin / dye / pedestal).
          const loadout = classCosmeticsOf(byClass, c.id).loadout;
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => setSelected(c.id)}
              aria-pressed={isSelected}
              // Selected card uses the gold accent (border + faint tint) so the
              // chosen class reads clearly — no per-class color.
              style={
                isSelected
                  ? { borderColor: 'var(--color-gold)', background: 'rgba(200,162,74,0.08)' }
                  : undefined
              }
              className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                isSelected
                  ? ''
                  : 'border-white/10 bg-black/30 hover:border-white/25 hover:bg-black/40'
              }`}
            >
              {/* Live 3D portrait of this class with its equipped cosmetics. The
                  selected one slowly rotates; the rest hold a still pose. */}
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                <ClassPreview
                  characterClass={c.id}
                  skinId={loadout.skinId}
                  dyeId={loadout.dyeId}
                  pedestalId={loadout.pedestalId}
                  lite
                  spin={isSelected}
                />
              </div>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-sm tracking-wide text-white">
                  {c.name}
                </span>
                <span className="block truncate text-[11px] text-muted">{c.role}</span>
              </span>
              <LevelBadge level={level} size="xs" className="shrink-0" />
            </button>
          );
        })}
      </div>
      <ClassInfo def={def} />
    </div>
  );
}
