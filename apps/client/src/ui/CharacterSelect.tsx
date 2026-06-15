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
import { Card, IconButton } from './primitives';
import { ABILITY_ICON } from './abilityIcons';
import { AbilityHover } from './AbilityTooltipCard';
import { STAT_COLORS } from './theme';

/** Title-case a snake_case ability id ("frost_nova" → "Frost Nova"). */
const titleCase = (s: string) =>
  s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** One big vital readout — a glowing colored numeral under an icon medallion,
 *  centred in its half. Scales down a step on small screens. */
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
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12"
        style={{ background: `radial-gradient(circle at center, ${color}33, transparent 72%)` }}
      >
        <Icon aria-hidden="true" className="h-5 w-5 sm:h-6 sm:w-6" style={{ color }} />
      </span>
      <span className="text-[10px] uppercase tracking-[0.25em] text-muted">{label}</span>
      <span
        className="font-display text-3xl leading-none tabular-nums sm:text-4xl"
        style={{ color, textShadow: `0 0 20px ${color}66` }}
      >
        {value}
      </span>
    </div>
  );
}

function ClassInfo({ def }: { def: ClassDefinition }) {
  return (
    <Card variant="inset" className="flex flex-col gap-4">
      {/* The two numbers that define the class, big and side-by-side — health on
          the left, mana on the right. Clearer than two tiny bars for two values. */}
      <div className="relative grid grid-cols-2 items-start gap-2 py-1 sm:gap-3">
        <span className="pointer-events-none absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-linear-to-b from-transparent via-white/15 to-transparent" />
        <Vital icon={Heart} label="Health" value={def.stats.health} color={STAT_COLORS.positive} />
        <Vital icon={Droplet} label="Mana" value={def.stats.mana} color={STAT_COLORS.mana} />
      </div>

      <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5">
        {def.abilities.map((ability) => (
          <AbilityBadge key={ability} ability={ability} />
        ))}
      </div>
    </Card>
  );
}

/** An ability medallion — a gold icon tile with its name — that lifts and glows
 *  on hover and reveals the full tooltip (effects + values). */
function AbilityBadge({ ability }: { ability: AbilityKind }) {
  const Icon = ABILITY_ICON[ability];
  return (
    <AbilityHover
      ability={ability}
      tapToShow
      className="group flex w-18 cursor-pointer select-none flex-col items-center gap-1.5"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-gold/40 bg-linear-to-b from-gold/20 to-gold/6 text-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-gold group-hover:from-gold/30 group-hover:shadow-[0_0_18px_rgba(200,162,74,0.4)]">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="w-full truncate text-center text-[9px] font-medium uppercase tracking-wider text-muted transition-colors group-hover:text-gold/90">
        {titleCase(ability)}
      </span>
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
