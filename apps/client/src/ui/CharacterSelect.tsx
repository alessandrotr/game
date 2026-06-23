import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Droplet,
  Swords,
  Sparkles,
  Crosshair,
  Cross,
  type LucideIcon,
} from 'lucide-react';
import {
  CLASS_LIST,
  classCosmeticsOf,
  getClassDefinition,
  type CharacterClass,
  type AbilityKind,
  type ClassDefinition,
} from '@arena/shared';

/** Pill/selector icon per class. */
const CLASS_ICON: Record<CharacterClass, LucideIcon> = {
  warrior: Swords,
  mage: Sparkles,
  archer: Crosshair,
  priest: Cross,
};
import { useCharacterStore } from '../store/useCharacterStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCosmeticsStore } from '../store/useCosmeticsStore';
import { preloadCharacterModels } from '../assets/preload';
import { ClassPreview } from './ClassPreview';
import { AssetLoadingBar } from './AssetLoadingBar';
import { AvatarFrame } from './AvatarFrame';
import { Card } from './primitives';
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

/** Prev / next carousel control — a frameless gold chevron with a generous hit
 *  area. At rest it's a quiet, dark-shadowed glyph; on hover it brightens to
 *  gold, scales up, slides in its travel direction, and blooms a soft radial
 *  glow behind it. Tactile press on click. Premium, not a boxy button. */
function CarouselArrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  const prev = dir === 'prev';
  const Icon = prev ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={prev ? 'Previous class' : 'Next class'}
      onClick={onClick}
      className={`group absolute top-1/2 z-10 flex h-20 w-14 -translate-y-1/2 items-center justify-center ${
        prev ? 'left-0' : 'right-0'
      }`}
    >
      {/* Soft radial gold bloom behind the glyph — scales + fades in on hover. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-12 w-12 scale-50 rounded-full opacity-0 blur-md transition-all duration-300 ease-out group-hover:scale-100 group-hover:opacity-100"
        style={{ background: 'radial-gradient(circle, rgba(200,162,74,0.6), transparent 70%)' }}
      />
      <Icon
        size={32}
        strokeWidth={2.5}
        aria-hidden="true"
        className={`relative text-gold/55 drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)] transition-all duration-200 ease-out group-hover:scale-125 group-hover:text-gold group-hover:drop-shadow-[0_0_12px_rgba(200,162,74,0.9)] group-active:scale-95 ${
        prev ? 'group-hover:-translate-x-1' : 'group-hover:translate-x-1'
      }`}
      />
    </button>
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
      {/* Class selector — click a name to jump straight to that class.
          Scrolls horizontally on mobile; wraps and centers from sm up. */}
      <div className="-my-2 mb-2 flex items-center gap-2 overflow-x-auto px-1 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:justify-center sm:overflow-x-visible">
        {CLASS_LIST.map((c, i) => {
          const Icon = CLASS_ICON[c.id];
          return (
            <button
              key={c.id}
              type="button"
              aria-label={`Select ${c.name}`}
              aria-current={i === idx}
              onClick={() => setSelected(c.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 font-display text-xs tracking-[0.18em] transition-colors duration-200 ${
                i === idx
                  ? 'bg-gold text-black shadow-sm'
                  : 'text-white/55 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              {c.name}
            </button>
          );
        })}
      </div>

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

        {/* Prev / next — gold medallion arrows matching the ability badges. */}
        <CarouselArrow dir="prev" onClick={() => go(-1)} />
        <CarouselArrow dir="next" onClick={() => go(1)} />
      </div>

      <ClassInfo def={def} />
    </div>
  );
}
