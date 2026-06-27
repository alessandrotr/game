import { useEffect, useRef } from 'react';
import {
  Heart,
  Droplet,
  Swords,
  Sparkles,
  Crosshair,
  Cross,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  ABILITY_SLOTS,
  CLASS_LIST,
  CLASS_LOADOUTS,
  classCosmeticsOf,
  getClassDefinition,
  type CharacterClass,
  type ClassDefinition,
} from '@arena/shared';

/** Roster icon per class (also used on the featured nameplate). */
const CLASS_ICON: Record<CharacterClass, LucideIcon> = {
  warrior: Swords,
  mage: Sparkles,
  archer: Crosshair,
  priest: Cross,
  ninja: Zap,
};
import { useCharacterStore } from '../store/useCharacterStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCosmeticsStore } from '../store/useCosmeticsStore';
import { preloadCharacterModels } from '../assets/preload';
import { ClassPreview } from './ClassPreview';
import {
  CharacterThumbStage,
  registerCharacterThumb,
  type CharacterThumbHandle,
} from '../render/characterThumbnails';
import { AssetLoadingBar } from './AssetLoadingBar';
import { AvatarFrame } from './AvatarFrame';
import { Card, LevelBadge } from './primitives';
import { rimColorOf } from './rim';
import { AbilityBadge } from './AbilityBadge';
import { STAT_COLORS } from './theme';

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
        {ABILITY_SLOTS.map((slot) => {
          const ability = CLASS_LOADOUTS[def.id][slot];
          return ability ? <AbilityBadge key={slot} ability={ability} slot={slot} /> : null;
        })}
      </div>
    </Card>
  );
}

/** L-shaped bracket corners that frame the selected roster cell — the "cursor"
 *  sitting on your pick, the way a fighting-game select grid reads. Tinted to the
 *  equipped rim color. */
function SelectBrackets({ color }: { color: string }) {
  const base = 'pointer-events-none absolute h-3 w-3';
  return (
    <>
      <span
        aria-hidden
        className={`${base} left-0.5 top-0.5 border-l-2 border-t-2`}
        style={{ borderColor: color }}
      />
      <span
        aria-hidden
        className={`${base} right-0.5 top-0.5 border-r-2 border-t-2`}
        style={{ borderColor: color }}
      />
      <span
        aria-hidden
        className={`${base} bottom-0.5 left-0.5 border-b-2 border-l-2`}
        style={{ borderColor: color }}
      />
      <span
        aria-hidden
        className={`${base} bottom-0.5 right-0.5 border-b-2 border-r-2`}
        style={{ borderColor: color }}
      />
    </>
  );
}

/** The per-tile 2D canvas the shared {@link CharacterThumbStage} blits this
 *  class's headshot into. Costs no WebGL context of its own. */
function CharacterThumb({ characterClass }: { characterClass: CharacterClass }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const handle: CharacterThumbHandle = { canvas: ref.current, characterClass };
    return registerCharacterThumb(handle);
  }, [characterClass]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

/** A single fighter cell in the roster grid. The highlighted cell IS the pick;
 *  clicking it (or arrowing onto it) swaps the featured portrait. Its background
 *  is a live 3D headshot of the class (one shared WebGL context drives them all),
 *  with the name + level riding over a darkening gradient. */
function FighterTile({
  def,
  level,
  selected,
  accent,
  onSelect,
}: {
  def: ClassDefinition;
  level: number;
  selected: boolean;
  /** The class's equipped rim color — the accent when this tile is the pick. */
  accent: string;
  onSelect: () => void;
}) {
  const Icon = CLASS_ICON[def.id];
  return (
    <button
      type="button"
      aria-label={`Select ${def.name}`}
      aria-current={selected}
      onClick={onSelect}
      className={`group relative aspect-square overflow-hidden rounded-md border transition-all duration-150 ${
        selected ? '-translate-y-0.5' : 'border-white/10 hover:border-white/30'
      }`}
      style={selected ? { borderColor: accent, boxShadow: `0 0 20px ${accent}59` } : undefined}
    >
      {/* Live 3D headshot, blitted in from the shared offscreen stage. */}
      <CharacterThumb characterClass={def.id} />
      {/* The picked fighter shows in full color (washed with its rim color); the
          rest are dimmed back so the selection reads at a glance. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-colors duration-150 ${
          selected
            ? ''
            : 'bg-linear-to-t from-black/90 via-black/55 to-black/70 group-hover:from-black/80 group-hover:via-black/35 group-hover:to-black/55'
        }`}
        style={
          selected
            ? {
                backgroundImage: `linear-gradient(to top, ${accent}40, transparent 55%, rgba(0,0,0,0.25))`,
              }
            : undefined
        }
      />

      {/* The player's level on this class — the gem, tinted to the rim when picked. */}
      <span className="absolute left-2.5 top-2.5">
        <LevelBadge level={level} size="xxs" color={accent} />
      </span>
      {/* Full-width name plate across the foot of the tile; rim-colored when picked. */}
      <span
        className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1 font-display text-[10px] uppercase tracking-[0.16em] ${
          selected ? 'text-black' : 'bg-black/65 text-white/85 group-hover:text-white'
        }`}
        style={selected ? { backgroundColor: accent } : undefined}
      >
        <Icon size={11} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{def.name}</span>
      </span>
      {selected && <SelectBrackets color={accent} />}
    </button>
  );
}

/** Character-select stage, fighting-game styled: a big featured fighter portrait
 *  with a bold nameplate on the left, the roster grid you move the cursor across
 *  on the right, and the picked class's stats/abilities below it. Navigate with
 *  the roster cells or the ← / → keys. */
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
  /** Step to another fighter, wrapping around — this is what changes the pick. */
  const go = (delta: number) => setSelected(CLASS_LIST[(idx + delta + count) % count]!.id);

  const levelByClass = new Map(progress.map((p) => [p.characterClass, p.level]));
  const level = levelByClass.get(selected) ?? 1;
  const loadout = classCosmeticsOf(byClass, selected).loadout;

  return (
    <div
      className="flex flex-col gap-4"
      role="group"
      aria-label="Choose your fighter"
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
    >
      {/* Eyebrow banner — flanked by hairlines, the marquee over a fighter select. */}
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-linear-to-r from-transparent to-gold/40" />
        <span className="font-display text-xs uppercase tracking-[0.4em] text-gold/80">
          Select Your Fighter
        </span>
        <span className="h-px flex-1 bg-linear-to-l from-transparent to-gold/40" />
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        {/* LEFT — the roster you move the cursor across, then the picked
            fighter's vitals + abilities. */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            {CLASS_LIST.map((c, i) => (
              <FighterTile
                key={c.id}
                def={c}
                level={levelByClass.get(c.id) ?? 1}
                selected={i === idx}
                accent={rimColorOf(classCosmeticsOf(byClass, c.id).loadout.rimId)}
                onSelect={() => setSelected(c.id)}
              />
            ))}
          </div>

          <ClassInfo def={def} />
        </div>

        {/* RIGHT — the featured fighter: a full-height portrait panel with the
            description floated over its top edge and the nameplate burnt across
            its lower edge. Hidden on mobile (the roster headshots already show
            each fighter); the grid is single-column there. */}
        <div className="hidden sm:block">
          <AvatarFrame rimId={loadout.rimId} shape="panel" size="lg" className="h-full w-full">
            {/* The full showcase canvas: drag to turn your fighter, scroll/pinch
                to zoom (OrbitControls). `transparent` lets the dark panel stage
                show through; `top` framing keeps the model clear of the nameplate.
                No auto-spin — the player drives the rotation. */}
            <div className="absolute inset-0 cursor-grab active:cursor-grabbing">
              <ClassPreview
                characterClass={selected}
                skinId={loadout.skinId}
                dyeId={loadout.dyeId}
                pedestalId={loadout.pedestalId}
                weaponId={loadout.weaponId}
                enchantId={loadout.enchantId}
                align="top"
                transparent
                spin={false}
              />
            </div>

            {/* The class's one-line identity, floated over the top of the art. */}
            <p className="pointer-events-none absolute inset-x-1.5 top-1.5 bg-linear-to-b from-black/85 via-black/45 to-transparent px-4 pb-10 pt-3 text-center text-xs leading-relaxed text-white/80">
              {def.description}
            </p>

            {/* Nameplate burnt over the bottom of the art — the level gem +
                class name, the way the picked fighter is announced. */}
            <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-end gap-4 bg-linear-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-10">
              <LevelBadge level={level} size="sm" color={rimColorOf(loadout.rimId)} />
              <span
                className="font-display text-2xl uppercase leading-none tracking-[0.12em] text-text sm:text-3xl"
                style={{ textShadow: '0 0 18px rgba(200,162,74,0.45)' }}
              >
                {def.name}
              </span>
            </div>

            {/* Progress over the portrait while the class GLBs download. */}
            <AssetLoadingBar label="Loading fighter…" />
          </AvatarFrame>
        </div>
      </div>

      {/* One hidden WebGL context that draws every roster headshot above. */}
      <CharacterThumbStage />
    </div>
  );
}
