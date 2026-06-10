import { useEffect, useReducer } from 'react';
import {
  ABILITIES,
  ABILITY_SLOTS,
  CLASS_LOADOUTS,
  type AbilityKind,
  type AbilitySlot,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { cooldownRemaining } from '../store/abilityCooldowns';

/** Placeholder glyphs until real ability icons (a reserved `iconUrl`) land. */
const ABILITY_GLYPH: Record<AbilityKind, string> = {
  fireball: '🔥',
  heal: '✚',
  frost_nova: '❄️',
  shockwave: '💥',
  arcane_bolt: '🔷',
  arcane_blast: '🔮',
};

/**
 * MOBA action bar (Phase 5.2): the four QWER slots for the local player's class,
 * each with an icon, hotkey label, a cooldown sweep, a cast-time fill, and a
 * mana-gated dim. A compact mana bar sits above it. Driven by a requestAnimation
 * Frame tick so the cooldown sweep is smooth and reads live (server-authoritative)
 * mana straight from the store snapshot.
 */
export function ActionBar() {
  const sessionId = useGameStore((s) => s.sessionId);
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  if (!me) return null;

  const loadout = CLASS_LOADOUTS[me.characterClass];
  const manaRatio = me.maxMana > 0 ? Math.max(0, Math.min(1, me.mana / me.maxMana)) : 0;

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
      {/* Mana bar */}
      <div className="h-1.5 w-[244px] overflow-hidden rounded-full bg-black/50">
        <div
          className="h-full rounded-full bg-[#60a5fa] transition-[width] duration-100"
          style={{ width: `${manaRatio * 100}%` }}
        />
      </div>

      {/* QWER slots */}
      <div className="flex gap-2">
        {ABILITY_SLOTS.map((slot) => (
          <Slot key={slot} slot={slot} ability={loadout[slot]} mana={me.mana} />
        ))}
      </div>
    </div>
  );
}

function Slot({
  slot,
  ability,
  mana,
}: {
  slot: AbilitySlot;
  ability: AbilityKind | undefined;
  mana: number;
}) {
  // Empty slot — reserved, disabled.
  if (!ability) {
    return (
      <div className="relative flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-white/15 bg-panel/40">
        <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-muted">{slot}</span>
      </div>
    );
  }

  const config = ABILITIES[ability];
  const remaining = cooldownRemaining(ability);
  const onCooldown = remaining > 0;
  const elapsed = config.cooldownMs - remaining;
  const casting = config.castTimeMs > 0 && onCooldown && elapsed < config.castTimeMs;
  const noMana = mana < config.manaCost;

  // Fraction of the cooldown still to go (1 = just cast, 0 = ready) — drives the
  // top-down dark sweep that uncovers the icon as it comes off cooldown.
  const cooldownFrac = onCooldown ? remaining / config.cooldownMs : 0;
  const castFrac = casting ? elapsed / config.castTimeMs : 0;

  return (
    <div
      className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border bg-panel/80 ${
        noMana ? 'border-red-500/40' : 'border-accent/30'
      }`}
    >
      <span className={`text-2xl ${noMana && !onCooldown ? 'opacity-40 grayscale' : ''}`}>
        {ABILITY_GLYPH[ability]}
      </span>

      {/* Cooldown sweep (covers from the top, shrinking as it readies). */}
      {onCooldown && (
        <div
          className="absolute inset-x-0 top-0 bg-black/65"
          style={{ height: `${cooldownFrac * 100}%` }}
        />
      )}

      {/* Cast-time fill (rises from the bottom during a channel). */}
      {casting && (
        <div
          className="absolute inset-x-0 bottom-0 bg-[#fbbf24]/45"
          style={{ height: `${castFrac * 100}%` }}
        />
      )}

      {/* Cooldown seconds remaining. */}
      {onCooldown && !casting && (
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white tabular-nums">
          {(remaining / 1000).toFixed(remaining >= 1000 ? 0 : 1)}
        </span>
      )}

      <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-white/80">{slot}</span>
    </div>
  );
}
