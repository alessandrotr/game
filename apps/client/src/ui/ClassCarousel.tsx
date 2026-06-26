import { useState } from 'react';
import { useProgress } from '@react-three/drei';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ABILITIES, CLASS_LIST } from '@arena/shared';
import { ClassPreview } from './ClassPreview';
import { Badge, IconButton, Meter } from './primitives';

// Stat bar maxima are derived from the roster so the bars compare classes
// honestly without hardcoded magic numbers.
const MAX_HEALTH = Math.max(...CLASS_LIST.map((c) => c.stats.health));
const MAX_MANA = Math.max(...CLASS_LIST.map((c) => c.stats.mana));
const MAX_ATTACK = Math.max(...CLASS_LIST.map((c) => c.stats.attackDamage));

/** Shows the GLB download progress over the canvas (covers the heavier models
 *  without a blank frame). Reads drei's default loading manager at the DOM level,
 *  so it must live OUTSIDE the <ClassPreview> canvas. */
function CarouselLoader() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
      <span className="font-display text-sm tracking-[0.3em] text-gold/80">{Math.round(progress)}%</span>
    </div>
  );
}

/**
 * The single-canvas class showcase for the landing page. Renders exactly one
 * rotatable `ClassPreview` and swaps the class as the user navigates — only the
 * visible class's model is fetched (and `useGLTF` caches it), so there's never
 * more than one WebGL context or more than one in-flight model download.
 */
export function ClassCarousel() {
  const [index, setIndex] = useState(0);
  const cls = CLASS_LIST[index] ?? CLASS_LIST[0]!; // index is always in range
  const go = (delta: number) =>
    setIndex((prev) => (prev + delta + CLASS_LIST.length) % CLASS_LIST.length);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      {/* ONE WebGL canvas — characterClass swaps on navigation. */}
      <div className="relative min-h-[44vh] overflow-hidden rounded-2xl border border-gold/25 bg-black/40">
        <ClassPreview characterClass={cls.id} />
        <CarouselLoader />
        <IconButton
          icon={ChevronLeft}
          aria-label="Previous class"
          iconSize={22}
          variant="panel"
          onClick={() => go(-1)}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-2"
        />
        <IconButton
          icon={ChevronRight}
          aria-label="Next class"
          iconSize={22}
          variant="panel"
          onClick={() => go(1)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2"
        />
        <div className="pointer-events-none absolute right-4 top-4 text-[10px] uppercase tracking-[0.2em] text-white/35">
          drag to rotate · scroll to zoom
        </div>
      </div>

      {/* Details panel (pure DOM). */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-display text-3xl tracking-wider text-text">{cls.name}</h3>
          <p className="text-sm uppercase tracking-[0.2em] text-muted">{cls.role}</p>
          <p className="mt-3 text-sm leading-relaxed text-text/90">{cls.description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {cls.abilities.map((ability) => (
            <Badge key={ability} variant="gold">
              {ABILITIES[ability].name}
            </Badge>
          ))}
        </div>

        <div className="flex flex-col gap-2.5">
          <Meter
            layout="stacked"
            label="Health"
            value={cls.stats.health}
            max={MAX_HEALTH}
            fill="var(--color-positive)"
            valueText={cls.stats.health}
            labelClassName="text-xs uppercase tracking-wider text-muted"
            valueClassName="text-xs text-white/80"
          />
          <Meter
            layout="stacked"
            label="Mana"
            value={cls.stats.mana}
            max={MAX_MANA}
            fill="var(--color-mana)"
            valueText={cls.stats.mana}
            labelClassName="text-xs uppercase tracking-wider text-muted"
            valueClassName="text-xs text-white/80"
          />
          <Meter
            layout="stacked"
            label="Attack"
            value={cls.stats.attackDamage}
            max={MAX_ATTACK}
            fill="var(--color-gold)"
            valueText={cls.stats.attackDamage}
            labelClassName="text-xs uppercase tracking-wider text-muted"
            valueClassName="text-xs text-white/80"
          />
        </div>

        {/* Class selector buttons */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {CLASS_LIST.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Show ${c.name}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={
                i === index
                  ? 'rounded-full border border-gold bg-gold/15 px-3 py-1 text-xs uppercase tracking-[0.15em] text-gold'
                  : 'rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.15em] text-white/55 hover:border-white/40 hover:text-white/80'
              }
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
