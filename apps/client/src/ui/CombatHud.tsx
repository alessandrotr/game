import { useEffect, useRef, useState } from 'react';
import {
  ABILITIES,
  ABILITY_SLOTS,
  CLASS_LOADOUTS,
  xpProgress,
  type AbilityKind,
  type AbilitySlot,
  type CharacterClass,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { cooldownRemaining, getLocalCooldownMult, getLocalManaCostMult } from '../store/abilityCooldowns';
import { ABILITY_ICON } from './abilityIcons';
import { AbilityHover } from './AbilityTooltipCard';
import { castAbilitySlotMobile } from '../lib/abilityCast';
import { isTouchDevice } from '../hooks/useIsTouch';
import { ClassPreview } from './ClassPreview';
import { AvatarFrame } from './AvatarFrame';
import { rimColorOf } from './rim';

/** The mutable DOM handles a slot exposes so the rAF loop can update it without React. */
interface SlotEls {
  root: HTMLDivElement | null;
  icon: SVGSVGElement | null;
  sweep: HTMLDivElement | null;
  cast: HTMLDivElement | null;
  secs: HTMLSpanElement | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Don't track XP gains until the async profile load (a one-time xp set) has
 *  settled, so it isn't shown as a "gain", in ms. */
const XP_ARM_MS = 1500;
/** Batch window (ms): rapid gains (e.g. an AoE kill) coalesce into one popup. */
const XP_FLUSH_MS = 400;
/** How long an XP popup lives (matches the `xp-pop` keyframe), in ms. */
const XP_POP_MS = 1300;

/** Imperatively paint one slot's cooldown sweep / cast fill / mana-gate from live state. */
function paintSlot(els: SlotEls | undefined, ability: AbilityKind, mana: number): void {
  if (!els) return;
  try {
    const config = ABILITIES?.[ability];
    if (!config) return;
    const cdMs = config.cooldownMs * getLocalCooldownMult();
    const remaining = cooldownRemaining(ability);
    const onCooldown = remaining > 0;
    const elapsed = cdMs - remaining;
    const casting = config.castTimeMs > 0 && onCooldown && elapsed < config.castTimeMs;
    const noMana = mana < config.manaCost * getLocalManaCostMult();

    if (els.sweep) {
      els.sweep.style.display = onCooldown ? 'block' : 'none';
      if (onCooldown) els.sweep.style.height = `${(remaining / cdMs) * 100}%`;
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
  } catch (err) {
    console.error('Error painting slot:', err);
  }
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
  // Equipped cosmetics shown in the portrait (skin/dye/pedestal), tracked like
  // the class so the imperative loop only re-renders when the look changes.
  const [appearance, setAppearance] = useState<{
    skinId: string;
    dyeId: string;
    pedestalId: string;
    rimId: string;
  } | null>(null);
  const renderedLook = useRef<string>('');

  const slots = useRef<Partial<Record<AbilitySlot, SlotEls>>>({});
  const portrait = useRef<HTMLDivElement>(null);
  const levelText = useRef<HTMLSpanElement>(null);
  const hpFill = useRef<HTMLDivElement>(null);
  const shieldFill = useRef<HTMLDivElement>(null);
  const hpText = useRef<HTMLSpanElement>(null);
  const manaFill = useRef<HTMLDivElement>(null);
  const manaText = useRef<HTMLSpanElement>(null);
  const xpFill = useRef<HTMLDivElement>(null);
  const xpText = useRef<HTMLSpanElement>(null);
  const deadTag = useRef<HTMLDivElement>(null);

  // XP-gain popups over the portrait. Tracked imperatively (a per-frame number
  // diff) and batched, so React only renders when a popup actually appears.
  const [xpPops, setXpPops] = useState<{ id: number; amount: number }[]>([]);
  const prevXp = useRef<number | null>(null);
  const xpArmAt = useRef(0);
  const pendingXp = useRef(0);
  const pendingSince = useRef(0);
  const popId = useRef(0);

  useEffect(() => {
    let raf = 0;
    const timers = new Set<number>();
    const loop = () => {
      const now = performance.now();
      const { sessionId, players } = useGameStore.getState();
      const me = sessionId ? players.get(sessionId) : undefined;
      const cls = (me?.characterClass as CharacterClass | undefined) ?? null;

      if (cls !== renderedClass.current) {
        renderedClass.current = cls;
        setCharacterClass(cls);
      }

      // Reflect equipped cosmetics in the portrait. Like the class, these rarely
      // change mid-match, so only re-render (a new key) when one actually does.
      const look = me ? `${me.skinId}|${me.dyeId}|${me.pedestalId}|${me.rimId}` : '';
      if (look !== renderedLook.current) {
        renderedLook.current = look;
        setAppearance(
          me
            ? { skinId: me.skinId, dyeId: me.dyeId, pedestalId: me.pedestalId, rimId: me.rimId }
            : null,
        );
      }

      if (me) {
        // Resource bars: width + centered "cur / max" value text.
        const hpRatio = clamp01(me.hp / me.maxHp);
        const shieldRatio = clamp01(me.shield / me.maxHp);
        if (hpFill.current) hpFill.current.style.width = `${hpRatio * 100}%`;
        if (shieldFill.current) {
          shieldFill.current.style.left = `${hpRatio * 100}%`;
          shieldFill.current.style.width = `${Math.min(shieldRatio, 1 - hpRatio) * 100}%`;
          shieldFill.current.style.display = me.shield > 0 ? 'block' : 'none';
        }
        if (hpText.current) {
          const shieldText = me.shield > 0 ? ` (+${Math.round(me.shield)})` : '';
          hpText.current.textContent = `${Math.max(0, Math.round(me.hp))} / ${Math.round(me.maxHp)}${shieldText}`;
        }
        const manaRatio = me.maxMana > 0 ? clamp01(me.mana / me.maxMana) : 0;
        if (manaFill.current) manaFill.current.style.width = `${manaRatio * 100}%`;
        if (manaText.current) manaText.current.textContent = `${Math.max(0, Math.round(me.mana))} / ${Math.round(me.maxMana)}`;
        if (levelText.current) levelText.current.textContent = String(me.level);

        // XP bar: progress through the current level (gold). `xpProgress` clamps.
        const prog = xpProgress(me.level, me.xp);
        if (xpFill.current) xpFill.current.style.width = `${prog.fraction * 100}%`;
        if (xpText.current) xpText.current.textContent = `${Math.floor(prog.into)} / ${prog.span} XP`;

        // XP-gain popups: baseline on the first frame and stay disarmed briefly
        // so the async profile load (a one-time xp set) isn't shown as a gain.
        // Real gains are accumulated and flushed as one popup per batch window.
        if (prevXp.current === null) {
          prevXp.current = me.xp;
          xpArmAt.current = now + XP_ARM_MS;
        }
        if (now >= xpArmAt.current && me.xp > prevXp.current) {
          pendingXp.current += me.xp - prevXp.current;
          if (pendingSince.current === 0) pendingSince.current = now;
        }
        prevXp.current = me.xp;
        if (pendingXp.current > 0 && now - pendingSince.current >= XP_FLUSH_MS) {
          const amount = pendingXp.current;
          const id = ++popId.current;
          pendingXp.current = 0;
          pendingSince.current = 0;
          setXpPops((p) => [...p, { id, amount }]);
          const t = window.setTimeout(() => {
            timers.delete(t);
            setXpPops((p) => p.filter((x) => x.id !== id));
          }, XP_POP_MS);
          timers.add(t);
        }

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
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  if (!characterClass) return null;
  const loadout = CLASS_LOADOUTS[characterClass];
  // Tint the level disc to match the equipped avatar rim (same token as PlayerCard).
  const rimColor = rimColorOf(appearance?.rimId);

  return (
    <div className="pointer-events-none flex items-end gap-2.5">
      {/* Champion portrait + level (left). */}
      <div className="relative h-[76px] w-[76px] shrink-0">
        {/* Floating "+N XP" gains rising off the top of the portrait. */}
        <div className="pointer-events-none absolute inset-x-0 -top-1 z-10" aria-hidden="true">
          {xpPops.map((p) => (
            <span
              key={p.id}
              className="absolute font-display text-[13px] font-extrabold whitespace-nowrap text-gold"
              style={{
                left: '50%',
                animation: `xp-pop ${XP_POP_MS}ms ease-out forwards`,
                textShadow: '0 0 10px rgba(255,215,97,0.7), 0 2px 4px rgba(0,0,0,0.85)',
              }}
            >
              +{p.amount} XP
            </span>
          ))}
        </div>
        {/* The equipped avatar rim frames the round portrait (fades on death). */}
        <div ref={portrait} className="h-full w-full transition-[filter,opacity] duration-300">
          <AvatarFrame rimId={appearance?.rimId} size="sm" className="h-full w-full">
            <ClassPreview
              characterClass={characterClass}
              skinId={appearance?.skinId}
              dyeId={appearance?.dyeId}
              pedestalId={appearance?.pedestalId}
              lite
              spin={false}
            />
          </AvatarFrame>
        </div>
        {/* Level disc, LoL-style, riding the portrait's lower edge — tinted to the rim. */}
        <div
          className="absolute -bottom-1 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border bg-linear-to-b from-panel to-bg shadow-md"
          style={{ borderColor: `${rimColor}b3`, boxShadow: `0 0 8px ${rimColor}59` }}
        >
          <span
            ref={levelText}
            className="font-display text-[11px] font-bold leading-none tabular-nums"
            style={{ color: rimColor }}
          >
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
        <ResourceBar fillRef={hpFill} shieldFillRef={shieldFill} textRef={hpText} fillClass="bg-positive" />
        {/* Mana bar (blue) with centered value. */}
        <ResourceBar fillRef={manaFill} textRef={manaText} fillClass="bg-mana" />
        {/* XP progress to next level (gold) — thinner, reads as progression. */}
        <div className="relative h-2.5 w-full overflow-hidden rounded bg-black/55 ring-1 ring-inset ring-black/40">
          <div
            ref={xpFill}
            className="absolute inset-y-0 left-0 bg-linear-to-r from-gold-dark to-gold transition-[width] duration-200"
            style={{ width: '0%' }}
          />
          <span
            ref={xpText}
            className="absolute inset-0 flex items-center justify-center text-[8px] font-bold uppercase tracking-wider tabular-nums text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
          />
        </div>

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
  shieldFillRef,
  textRef,
  fillClass,
}: {
  fillRef: React.RefObject<HTMLDivElement>;
  shieldFillRef?: React.RefObject<HTMLDivElement>;
  textRef: React.RefObject<HTMLSpanElement>;
  fillClass: string;
}) {
  return (
    <div className="relative h-4 w-full overflow-hidden rounded bg-black/55 ring-1 ring-inset ring-black/40">
      <div
        ref={fillRef}
        className={`absolute inset-y-0 left-0 ${fillClass} transition-[width] duration-100`}
        style={{ width: '0%' }}
      />
      {shieldFillRef && (
        <div
          ref={shieldFillRef}
          className="absolute inset-y-0 left-0 bg-[#7a8cff] transition-[width,left] duration-100 opacity-80"
          style={{ width: '0%', left: '0%' }}
        />
      )}
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
  // On touch devices the slot is the cast button: a tap fires the ability with
  // auto-aim (nearest enemy / facing). Desktop keeps the keyboard + hold-to-aim
  // flow, so the click handler is wired up only when there's a coarse pointer.
  const touch = isTouchDevice();
  return (
    <AbilityHover ability={ability} slot={slot} disabled={touch} className="pointer-events-auto relative">
      <div
        ref={root}
        onClick={touch ? () => castAbilitySlotMobile(slot) : undefined}
        style={touch ? { touchAction: 'manipulation' } : undefined}
        className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-accent/30 bg-panel/80 active:scale-95"
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
