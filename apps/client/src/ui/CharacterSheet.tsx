import { type ReactNode } from 'react';
import {
  ABILITY_SLOTS,
  CLASS_LOADOUTS,
  claimableCount,
  classCosmeticsOf,
  getClassDefinition,
  type CharacterClass,
} from '@arena/shared';
import { Sparkles, ShoppingBag, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCosmeticsStore } from '../store/useCosmeticsStore';
import { useSidebarStore } from './hud/sidebar/useSidebarStore';
import { Showcase } from './CustomizePanel';
import { AbilityBadge } from './AbilityBadge';
import { ClassVitals } from './ClassVitals';
import { Button, StatTile } from './primitives';
import { PANEL_SURFACE, SidebarHeader } from './hud/sidebar/panelChrome';
import { STAT_COLORS } from './theme';

/**
 * The player's own "paperdoll" character sheet. The champion stands free to the
 * left (the very same `Showcase` the store uses) beside its own info panel on the
 * right: the class vitals, the QWER ability kit (with rich tooltips), the lifetime
 * record, and a jump into the wardrobe. Opened from the champion portrait at the
 * top of the town rail. The borderless positioning container + backdrop are the
 * host wrapper's; this is just the showcase + the right panel.
 */
export function CharacterSheet({ onClose }: { onClose: () => void }) {
  const sessionId = useGameStore((s) => s.sessionId);
  useGameStore((s) => s.tick); // track live level / XP from the server
  const progress = useAuthStore((s) => s.progress);
  const byClass = useCosmeticsStore((s) => s.byClass);

  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  if (!me) return null;

  const characterClass: CharacterClass = me.characterClass;
  const def = getClassDefinition(characterClass);
  const record = progress.find((p) => p.characterClass === characterClass);

  const kills = record?.kills ?? me.kills;
  const deaths = record?.deaths ?? me.deaths;
  const wins = record?.wins ?? 0;
  const losses = record?.losses ?? 0;
  const kd = deaths === 0 ? kills.toFixed(2) : (kills / deaths).toFixed(2);
  const games = wins + losses;
  const winRate = games === 0 ? '—' : `${Math.round((wins / games) * 100)}%`;

  const owned = classCosmeticsOf(byClass, characterClass).owned;
  const claimable = claimableCount(owned, characterClass, me.level);
  const openWardrobe = () => useSidebarStore.getState().open('store');

  return (
    <>
      {/* Left — the exact same free-standing champion showcase the store uses. */}
      <Showcase characterClass={characterClass} />

      {/* Right — the only panel: class vitals, abilities, record, wardrobe CTA. */}
      <div
        className={cn(
          PANEL_SURFACE,
          'flex h-[80vh] w-[min(38rem,calc(100vw-26rem))] min-w-0 flex-col',
        )}
      >
        <SidebarHeader icon={UserRound} title="Champion" onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {/* Class vitals — health & mana, shown like the fighter select. */}
          <section>
            <SheetLabel>Class Profile</SheetLabel>
            <div className="mt-3">
              <ClassVitals def={def} />
            </div>
          </section>

          {/* Ability kit — same medallions + rich tooltips as the fighter select,
              tagged with their QWER key. */}
          <section>
            <SheetLabel>Abilities</SheetLabel>
            <div className="mt-3 flex flex-wrap justify-between gap-2">
              {ABILITY_SLOTS.map((slot) => {
                const kind = CLASS_LOADOUTS[characterClass][slot];
                return kind ? <AbilityBadge key={slot} ability={kind} slot={slot} /> : null;
              })}
            </div>
          </section>

          {/* Lifetime record */}
          <section>
            <SheetLabel>Record</SheetLabel>
            <div className="mt-3 flex gap-2">
              <StatTile
                variant="bordered"
                label="Kills"
                value={kills}
                color={STAT_COLORS.positive}
              />
              <StatTile
                variant="bordered"
                label="Deaths"
                value={deaths}
                color={STAT_COLORS.negative}
              />
              <StatTile variant="bordered" label="K/D" value={kd} color={STAT_COLORS.text} />
            </div>
            <div className="mt-2 flex gap-2">
              <StatTile variant="bordered" label="Wins" value={wins} color={STAT_COLORS.positive} />
              <StatTile
                variant="bordered"
                label="Losses"
                value={losses}
                color={STAT_COLORS.negative}
              />
              <StatTile variant="bordered" label="Win %" value={winRate} color={STAT_COLORS.text} />
            </div>
          </section>

          {/* Wardrobe jump */}
          <Button
            variant="goldCta"
            size="md"
            onClick={openWardrobe}
            className="mt-auto w-full justify-center gap-2"
          >
            {claimable > 0 ? (
              <Sparkles size={15} aria-hidden />
            ) : (
              <ShoppingBag size={15} aria-hidden />
            )}
            {claimable > 0 ? `Customize · ${claimable} to unlock` : 'Customize'}
          </Button>
        </div>
      </div>
    </>
  );
}

/** A small gold section label for the sheet's right column. */
function SheetLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-gold/80">
      <span className="h-px w-5 bg-linear-to-r from-gold/70 to-transparent" />
      {children}
    </h3>
  );
}
