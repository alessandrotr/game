import { useEffect, useRef, useState } from 'react';
import {
  ABILITIES,
  ABILITY_SLOTS,
  CLASS_LOADOUTS,
  type AbilityKind,
  type AbilitySlot,
  type CharacterClass,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { cooldownRemaining } from '../store/abilityCooldowns';
import { ABILITY_ICON } from './abilityIcons';
import { AbilityHover } from './AbilityTooltipCard';

/** The mutable DOM handles a slot exposes so the rAF loop can update it without React. */
interface SlotEls {
  root: HTMLDivElement | null;
  icon: SVGSVGElement | null;
  sweep: HTMLDivElement | null;
  cast: HTMLDivElement | null;
  secs: HTMLSpanElement | null;
}

/** Imperatively paint one slot's cooldown sweep / cast fill / mana-gate from live state. */
function paintSlot(els: SlotEls | undefined, ability: AbilityKind, mana: number): void {
  if (!els) return;
  const config = ABILITIES[ability];
  const remaining = cooldownRemaining(ability);
  const onCooldown = remaining > 0;
  const elapsed = config.cooldownMs - remaining;
  const casting = config.castTimeMs > 0 && onCooldown && elapsed < config.castTimeMs;
  const noMana = mana < config.manaCost;

  if (els.sweep) {
    els.sweep.style.display = onCooldown ? 'block' : 'none';
    if (onCooldown) els.sweep.style.height = `${(remaining / config.cooldownMs) * 100}%`;
  }
  if (els.cast) {
    els.cast.style.display = casting ? 'block' : 'none';
    if (casting) els.cast.style.height = `${(elapsed / config.castTimeMs) * 100}%`;
  }
  if (els.secs) {
    const show = onCooldown && !casting;
    els.secs.style.display = show ? 'flex' : 'none';
    if (show) els.secs.textContent = (remaining / 1000).toFixed(remaining >= 1000 ? 0 : 1);
  }
  // Dim the icon only when mana-gated and ready (not while on cooldown).
  const dim = noMana && !onCooldown;
  els.icon?.classList.toggle('opacity-40', dim);
  els.icon?.classList.toggle('grayscale', dim);
  els.root?.classList.toggle('border-red-500/40', noMana);
  els.root?.classList.toggle('border-accent/30', !noMana);
}

/**
 * MOBA action bar (Phase 5.2): the four QWER slots for the local player's class,
 * each with an icon, hotkey label, a cooldown sweep, a cast-time fill, and a
 * mana-gated dim, plus a compact mana bar.
 *
 * The per-frame visuals (cooldown sweep, cast fill, mana bar width, mana-gate)
 * are driven IMPERATIVELY by a single rAF loop that mutates DOM refs — so the
 * bar does NOT re-render React every frame. React only re-renders when the slot
 * layout changes (the local player's class), which is fixed for a match.
 */
export function ActionBar() {
  const [characterClass, setCharacterClass] = useState<CharacterClass | null>(null);
  const renderedClass = useRef<CharacterClass | null>(null);
  const manaFill = useRef<HTMLDivElement>(null);
  const slots = useRef<Partial<Record<AbilitySlot, SlotEls>>>({});

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const { sessionId, players } = useGameStore.getState();
      const me = sessionId ? players.get(sessionId) : undefined;
      const cls = (me?.characterClass as CharacterClass | undefined) ?? null;

      // Rebuild the layout only when the class (and thus loadout) changes.
      if (cls !== renderedClass.current) {
        renderedClass.current = cls;
        setCharacterClass(cls);
      }

      if (me) {
        const ratio = me.maxMana > 0 ? Math.max(0, Math.min(1, me.mana / me.maxMana)) : 0;
        if (manaFill.current) manaFill.current.style.width = `${ratio * 100}%`;
        const loadout = CLASS_LOADOUTS[me.characterClass as CharacterClass];
        for (const slot of ABILITY_SLOTS) {
          const ability = loadout?.[slot];
          if (ability) paintSlot(slots.current[slot], ability, me.mana);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!characterClass) return null;
  const loadout = CLASS_LOADOUTS[characterClass];

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
      {/* Mana bar (width driven imperatively). */}
      <div className="h-1.5 w-[244px] overflow-hidden rounded-full bg-black/50">
        <div
          ref={manaFill}
          className="h-full rounded-full bg-mana transition-[width] duration-100"
          style={{ width: '0%' }}
        />
      </div>

      {/* QWER slots. */}
      <div className="flex gap-2">
        {ABILITY_SLOTS.map((slot) => (
          <Slot
            key={slot}
            slot={slot}
            ability={loadout[slot]}
            register={(els) => {
              slots.current[slot] = els;
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Presentational slot: renders the static structure and registers its DOM nodes
 * with the parent so the rAF loop can paint them. All dynamic sub-elements are
 * always mounted (hidden via `display`), toggled imperatively — no per-frame React.
 */
function Slot({
  slot,
  ability,
  register,
}: {
  slot: AbilitySlot;
  ability: AbilityKind | undefined;
  register: (els: SlotEls) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const icon = useRef<SVGSVGElement>(null);
  const sweep = useRef<HTMLDivElement>(null);
  const cast = useRef<HTMLDivElement>(null);
  const secs = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ability) {
      register({
        root: root.current,
        icon: icon.current,
        sweep: sweep.current,
        cast: cast.current,
        secs: secs.current,
      });
    }
  }, [ability, register]);

  // Empty slot — reserved, disabled.
  if (!ability) {
    return (
      <div className="relative flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-white/15 bg-panel/40">
        <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-muted">{slot}</span>
      </div>
    );
  }

  const Icon = ABILITY_ICON[ability];
  return (
    // Portal-based tooltip on hover (never clipped by the HUD); pointer-events
    // re-enabled so the otherwise pass-through bar receives the hover.
    <AbilityHover ability={ability} slot={slot} className="pointer-events-auto relative">
      <div
        ref={root}
        className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-accent/30 bg-panel/80"
      >
        <Icon ref={icon} size={26} aria-hidden="true" className="text-accent" />
        {/* Cooldown sweep (covers from the top, shrinking as it readies). */}
        <div ref={sweep} className="absolute inset-x-0 top-0 bg-black/65" style={{ display: 'none' }} />
        {/* Cast-time fill (rises from the bottom during a channel). */}
        <div ref={cast} className="absolute inset-x-0 bottom-0 bg-cast/45" style={{ display: 'none' }} />
        {/* Cooldown seconds remaining. */}
        <span
          ref={secs}
          className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white tabular-nums"
          style={{ display: 'none' }}
        />
        <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-white/80">{slot}</span>
      </div>
    </AbilityHover>
  );
}

