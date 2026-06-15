import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Heart, Droplet, type LucideIcon } from 'lucide-react';
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
import { preloadCharacterModels } from '../assets/preload';
import { ClassPreview } from './ClassPreview';
import { AssetLoadingBar } from './AssetLoadingBar';
import { AvatarFrame } from './AvatarFrame';
import { Badge, Card, IconButton, Meter } from './primitives';
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

/** A swipeable carousel of the playable classes — the slide on screen IS the
 *  picked character. Navigate with the arrows, the dots, ← / → keys, or by
 *  dragging. Below sits the current class's stats/abilities. One 3D portrait
 *  (the visible class swaps inside a single canvas), showing its equipped look. */
export function CharacterSelect() {
  const selected = useCharacterStore((s) => s.selectedClass);
  const setSelected = useCharacterStore((s) => s.setSelectedClass);
  const progress = useAuthStore((s) => s.progress);
  const byClass = useCosmeticsStore((s) => s.byClass);
  const def = getClassDefinition(selected);

  // Front-run the class GLB downloads so the portrait (and the loading bar over
  // it) have something to show immediately.
  useEffect(() => {
    preloadCharacterModels();
  }, []);

  const count = CLASS_LIST.length;
  const idx = Math.max(
    0,
    CLASS_LIST.findIndex((c) => c.id === selected),
  );
  /** Step to another slide, wrapping around — this is what changes the pick. */
  const go = (delta: number) => setSelected(CLASS_LIST[(idx + delta + count) % count]!.id);

  const levelByClass = new Map(progress.map((p) => [p.characterClass, p.level]));
  const level = levelByClass.get(selected) ?? 1;
  const loadout = classCosmeticsOf(byClass, selected).loadout;

  // Drag-to-swipe: remember where a press began; on release, a horizontal throw
  // past the threshold flips to the previous / next class.
  const dragX = useRef<number | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    dragX.current = e.clientX;
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (dragX.current === null) return;
    const dx = e.clientX - dragX.current;
    dragX.current = null;
    if (dx > 40) go(-1);
    else if (dx < -40) go(1);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative select-none"
        role="group"
        aria-label="Choose your champion"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            go(-1);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            go(1);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => (dragX.current = null)}
      >
        {/* Big branded showcase: the portrait inside the equipped round avatar rim,
            with your level on this class as a gem riding the ring. */}
        <AvatarFrame
          rimId={loadout.rimId}
          level={level}
          size="lg"
          className="mx-auto aspect-square w-60"
        >
          {/* The visible class swaps INSIDE this one canvas (no per-class context).
              pointer-events-none so the swipe is handled by the container. */}
          <div className="pointer-events-none absolute inset-0">
            <ClassPreview
              characterClass={selected}
              skinId={loadout.skinId}
              dyeId={loadout.dyeId}
              pedestalId={loadout.pedestalId}
              lite
              spin={false}
            />
          </div>
          {/* Progress over the portrait while the class GLBs download. */}
          <AssetLoadingBar label="Loading champion…" />
        </AvatarFrame>

        {/* Prev / next. */}
        <IconButton
          icon={ChevronLeft}
          aria-label="Previous class"
          variant="panel"
          onClick={() => go(-1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full"
        />
        <IconButton
          icon={ChevronRight}
          aria-label="Next class"
          variant="panel"
          onClick={() => go(1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
        />
      </div>

      {/* Identity caption: who this slide is (the level gem sits on the ring above). */}
      <div className="mt-3 text-center">
        <div className="font-display text-xl tracking-wide text-white">{def.name}</div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted">{def.role}</div>
      </div>

      {/* Slide indicator — click a dot to jump straight to that class. */}
      <div className="mt-1 flex items-center justify-center gap-1.5">
        {CLASS_LIST.map((c, i) => (
          <button
            key={c.id}
            type="button"
            aria-label={`Select ${c.name}`}
            aria-current={i === idx}
            onClick={() => setSelected(c.id)}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? 'w-5 bg-gold' : 'w-1.5 bg-white/25 hover:bg-white/40'
            }`}
          />
        ))}
      </div>

      <ClassInfo def={def} />
    </div>
  );
}
