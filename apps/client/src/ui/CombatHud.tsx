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
import { ClassPreview } from './ClassPreview';

/** The mutable DOM handles a slot exposes so the rAF loop can update it without React. */
interface SlotEls {
  root: HTMLDivElement | null;
  icon: SVGSVGElement | null;
  sweep: HTMLDivElement | null;
  cast: HTMLDivElement | null;
  secs: HTMLSpanElement | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

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
  const dim = noMana && !onCooldown;
  els.icon?.classList.toggle('opacity-40', dim);
  els.icon?.classList.toggle('grayscale', dim);
  els.root?.classList.toggle('border-red-500/40', noMana);
  els.root?.classList.toggle('border-accent/30', !noMana);
}

/**
 * Arena combat HUD (LoL-style): one cohesive bottom unit that unifies the
 * player's identity and combat controls — a circular auto-rotating portrait with
 * the level on the left, the four QWER ability slots in the middle, and the HP /
 * mana bars beneath them. Replaces the old split of a top-left player card plus a
 * detached action bar, so the eye reads everything that matters in a fight in one
 * place.
 *
 * Per-frame visuals (cooldown sweeps, cast fills, mana-gating, the HP/MP bar
 * widths + value text, the level numeral) are driven IMPERATIVELY by a single rAF
 * loop that mutates DOM refs — React only re-renders when the local player's class
 * (and thus the ability loadout) changes, which is fixed for a match.
 */
export function CombatHud() {
  const [characterClass, setCharacterClass] = useState<CharacterClass | null>(null);
  const renderedClass = useRef<CharacterClass | null>(null);

  const slots = useRef<Partial<Record<AbilitySlot, SlotEls>>>({});
  const portrait = useRef<HTMLDivElement>(null);
  const levelText = useRef<HTMLSpanElement>(null);
  const hpFill = useRef<HTMLDivElement>(null);
  const hpText = useRef<HTMLSpanElement>(null);
  const manaFill = useRef<HTMLDivElement>(null);
  const manaText = useRef<HTMLSpanElement>(null);
  const deadTag = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const { sessionId, players } = useGameStore.getState();
      const me = sessionId ? players.get(sessionId) : undefined;
      const cls = (me?.characterClass as CharacterClass | undefined) ?? null;

      if (cls !== renderedClass.current) {
        renderedClass.current = cls;
        setCharacterClass(cls);
      }

      if (me) {
        // Resource bars: width + centered "cur / max" value text.
        if (hpFill.current) hpFill.current.style.width = `${clamp01(me.hp / me.maxHp) * 100}%`;
        if (hpText.current) hpText.current.textContent = `${Math.max(0, Math.round(me.hp))} / ${Math.round(me.maxHp)}`;
        const manaRatio = me.maxMana > 0 ? clamp01(me.mana / me.maxMana) : 0;
        if (manaFill.current) manaFill.current.style.width = `${manaRatio * 100}%`;
        if (manaText.current) manaText.current.textContent = `${Math.max(0, Math.round(me.mana))} / ${Math.round(me.maxMana)}`;
        if (levelText.current) levelText.current.textContent = String(me.level);

        // Death state: fade the portrait and surface a respawn tag.
        portrait.current?.classList.toggle('opacity-45', !me.alive);
        portrait.current?.classList.toggle('grayscale', !me.alive);
        if (deadTag.current) deadTag.current.style.display = me.alive ? 'none' : 'block';

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
    <div className="pointer-events-none flex items-end gap-2.5">
      {/* Champion portrait + level (left). */}
      <div className="relative h-[76px] w-[76px] shrink-0">
        <div
          ref={portrait}
          className="h-full w-full overflow-hidden rounded-full border-2 border-gold/70 bg-black/50 shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-[filter,opacity] duration-300"
        >
          <ClassPreview characterClass={characterClass} lite />
        </div>
        {/* Level disc, LoL-style, riding the portrait's lower edge. */}
        <div className="absolute -bottom-1 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border border-gold/70 bg-linear-to-b from-panel to-bg shadow-md">
          <span ref={levelText} className="font-display text-[11px] font-bold leading-none text-gold tabular-nums">
            1
          </span>
        </div>
      </div>

      {/* Abilities + resource bars (center). */}
      <div className="flex flex-col items-stretch gap-1.5">
        <div className="flex justify-center gap-2">
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

        {/* HP bar (green) with centered value. */}
        <ResourceBar fillRef={hpFill} textRef={hpText} fillClass="bg-positive" />
        {/* Mana bar (blue) with centered value. */}
        <ResourceBar fillRef={manaFill} textRef={manaText} fillClass="bg-mana" />

        <div
          ref={deadTag}
          className="text-center text-[11px] font-semibold text-negative"
          style={{ display: 'none' }}
        >
          Defeated — respawning…
        </div>
      </div>
    </div>
  );
}

/** A LoL-style resource bar: a track with an imperatively-painted fill + centered value text. */
function ResourceBar({
  fillRef,
  textRef,
  fillClass,
}: {
  fillRef: React.RefObject<HTMLDivElement | null>;
  textRef: React.RefObject<HTMLSpanElement | null>;
  fillClass: string;
}) {
  return (
    <div className="relative h-4 w-full overflow-hidden rounded bg-black/55 ring-1 ring-inset ring-black/40">
      <div
        ref={fillRef}
        className={`absolute inset-y-0 left-0 ${fillClass} transition-[width] duration-100`}
        style={{ width: '0%' }}
      />
      <span
        ref={textRef}
        className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
      />
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

  if (!ability) {
    return (
      <div className="relative flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-white/15 bg-panel/40">
        <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-muted">{slot}</span>
      </div>
    );
  }

  const Icon = ABILITY_ICON[ability];
  return (
    <AbilityHover ability={ability} slot={slot} className="pointer-events-auto relative">
      <div
        ref={root}
        className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-accent/30 bg-panel/80"
      >
        <Icon ref={icon} size={26} aria-hidden="true" className="text-accent" />
        <div ref={sweep} className="absolute inset-x-0 top-0 bg-black/65" style={{ display: 'none' }} />
        <div ref={cast} className="absolute inset-x-0 bottom-0 bg-cast/45" style={{ display: 'none' }} />
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
