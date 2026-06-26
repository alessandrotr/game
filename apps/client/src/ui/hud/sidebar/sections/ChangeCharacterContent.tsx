import { useEffect, useRef } from 'react';
import { Swords, Sparkles, Crosshair, Cross, Zap, type LucideIcon } from 'lucide-react';
import {
  CLASS_LIST,
  classCosmeticsOf,
  type CharacterClass,
  type ClassDefinition,
} from '@arena/shared';
import { useGameStore } from '../../../../store/useGameStore';
import { useAuthStore } from '../../../../store/useAuthStore';
import { useCosmeticsStore } from '../../../../store/useCosmeticsStore';
import { changeCharacter } from '../../../../network/colyseus';
import {
  CharacterThumbStage,
  registerCharacterThumb,
} from '../../../../render/characterThumbnails';
import { LevelBadge } from '../../../primitives';
import { rimColorOf } from '../../../rim';
import { useSidebarStore } from '../useSidebarStore';

/** Roster icon per class (mirrors the character-select screen). */
const CLASS_ICON: Record<CharacterClass, LucideIcon> = {
  warrior: Swords,
  mage: Sparkles,
  archer: Crosshair,
  priest: Cross,
  ninja: Zap,
};

/** The per-tile 2D canvas the shared {@link CharacterThumbStage} blits this
 *  class's live headshot into. Costs no WebGL context of its own. */
function Thumb({ characterClass }: { characterClass: CharacterClass }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return registerCharacterThumb({ canvas: ref.current, characterClass });
  }, [characterClass]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

/** One champion cell — a live headshot with level gem + nameplate. The current
 *  champion is marked (and inert); picking any other switches to it. */
function ChampionTile({
  def,
  level,
  accent,
  current,
  onSelect,
}: {
  def: ClassDefinition;
  level: number;
  accent: string;
  current: boolean;
  onSelect: () => void;
}) {
  const Icon = CLASS_ICON[def.id];
  return (
    <button
      type="button"
      aria-label={current ? `${def.name} (current)` : `Switch to ${def.name}`}
      aria-current={current}
      disabled={current}
      onClick={onSelect}
      className={`group relative aspect-square overflow-hidden rounded-lg border transition-all duration-150 ${
        current
          ? 'cursor-default'
          : 'border-white/10 hover:-translate-y-0.5 hover:border-white/30'
      }`}
      style={current ? { borderColor: accent, boxShadow: `0 0 18px ${accent}55` } : undefined}
    >
      <Thumb characterClass={def.id} />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-colors duration-150 ${
          current
            ? ''
            : 'bg-linear-to-t from-black/90 via-black/45 to-black/65 group-hover:from-black/80 group-hover:via-black/30 group-hover:to-black/50'
        }`}
        style={
          current
            ? { backgroundImage: `linear-gradient(to top, ${accent}40, transparent 55%, rgba(0,0,0,0.25))` }
            : undefined
        }
      />
      <span className="absolute left-2 top-2">
        <LevelBadge level={level} size="xxs" color={accent} />
      </span>
      {current && (
        <span
          className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-black"
          style={{ backgroundColor: accent }}
        >
          Now
        </span>
      )}
      <span
        className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1 font-display text-[10px] uppercase tracking-[0.16em] ${
          current ? 'text-black' : 'bg-black/65 text-white/85 group-hover:text-white'
        }`}
        style={current ? { backgroundColor: accent } : undefined}
      >
        <Icon size={11} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{def.name}</span>
      </span>
    </button>
  );
}

/**
 * Change-character menu — the class roster as live headshots. Picking a champion
 * swaps the player in place (no bounce back to the character-select screen) via
 * {@link changeCharacter}, which rebuilds the join payload for that class and does
 * the same covered town swap as a portal.
 */
export function ChangeCharacterContent() {
  const close = useSidebarStore((s) => s.close);
  const sessionId = useGameStore((s) => s.sessionId);
  useGameStore((s) => s.tick); // track the live character after a swap
  const current = sessionId
    ? useGameStore.getState().players.get(sessionId)?.characterClass
    : undefined;
  const progress = useAuthStore((s) => s.progress);
  const byClass = useCosmeticsStore((s) => s.byClass);
  const levelByClass = new Map(progress.map((p) => [p.characterClass, p.level]));

  const pick = (c: CharacterClass) => {
    if (c === current) return;
    close();
    void changeCharacter(c);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <p className="mb-3 text-[13px] text-muted">
        Pick a different champion — town reloads with your new fighter and its equipped look.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {CLASS_LIST.map((c) => (
          <ChampionTile
            key={c.id}
            def={c}
            level={levelByClass.get(c.id) ?? 1}
            accent={rimColorOf(classCosmeticsOf(byClass, c.id).loadout.rimId)}
            current={c.id === current}
            onSelect={() => pick(c.id)}
          />
        ))}
      </div>
      {/* One hidden WebGL context draws every headshot above. */}
      <CharacterThumbStage />
    </div>
  );
}
