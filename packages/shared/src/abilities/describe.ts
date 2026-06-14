/**
 * Human-readable ability descriptions, generated from the same effect data the
 * server resolves. Because the text is derived (not hand-written per ability),
 * a tooltip can never drift from what an ability actually does — add an effect
 * and its phrasing appears automatically.
 */

import type { AbilityDef, Effect, LeafEffect, StatusSpec } from './effects.js';

/** A structured tooltip for an ability: header stats + plain-English effect lines. */
export interface AbilityTooltip {
  name: string;
  /** How it's aimed, e.g. 'Skillshot', 'Ground-targeted', 'Targeted', 'Self / instant'. */
  aimLabel: string;
  cooldownMs: number;
  manaCost: number;
  castTimeMs: number;
  /** Reach in world units (0 = self). */
  range: number;
  /** One sentence per top-level effect. */
  lines: string[];
}

const AIM_LABEL: Record<NonNullable<AbilityDef['aim']>, string> = {
  self: 'Self / instant',
  direction: 'Skillshot',
  point: 'Ground-targeted',
  unit: 'Targeted',
};

/** ms → a compact seconds string, e.g. 1500 → '1.5', 2000 → '2'. */
function secs(ms: number): string {
  const s = ms / 1000;
  return Number.isInteger(s) ? String(s) : s.toFixed(1);
}

/** A status magnitude as a signed percentage relative to 1 (0.5 → '50', 1.3 → '30'). */
function pct(magnitude: number | undefined, mode: 'reduce' | 'increase'): string {
  const m = magnitude ?? 1;
  const delta = mode === 'reduce' ? 1 - m : m - 1;
  return String(Math.round(Math.abs(delta) * 100));
}

/** Phrase a single status, e.g. 'stuns for 1.5s', 'slows by 50% for 2s'. */
function statusPhrase(s: StatusSpec): string {
  const dur = `for ${secs(s.durationMs)}s`;
  switch (s.kind) {
    case 'stun':
      return `stuns ${dur}`;
    case 'root':
      return `roots ${dur}`;
    case 'silence':
      return `silences ${dur}`;
    case 'slow':
      return `slows by ${pct(s.magnitude, 'reduce')}% ${dur}`;
    case 'haste':
      return `grants +${pct(s.magnitude, 'increase')}% move speed ${dur}`;
    case 'attack_speed':
      return `grants +${pct(s.magnitude, 'increase')}% attack speed ${dur}`;
    case 'damage_amp':
      return `increases damage taken by ${pct(s.magnitude, 'increase')}% ${dur}`;
    case 'empower':
      return `empowers your next hit with +${s.magnitude ?? 0} damage`;
    case 'dot':
      return `deals ${s.tickAmount ?? 0} damage every ${secs(s.tickMs ?? 1000)}s ${dur}`;
    case 'hot':
      return `heals ${s.tickAmount ?? 0} every ${secs(s.tickMs ?? 1000)}s ${dur}`;
    case 'shield':
      return `shields ${dur}`;
  }
}

/** Phrase a leaf effect (the verbs that hit a target). */
function leafPhrase(leaf: LeafEffect): string {
  switch (leaf.type) {
    case 'damage':
      return `deals ${leaf.amount} damage`;
    case 'heal':
      return `heals ${leaf.amount} health`;
    case 'shield':
      return `grants a ${leaf.amount}-point shield for ${secs(leaf.durationMs)}s`;
    case 'knockback':
      return `knocks back ${leaf.distance} units`;
    case 'status':
      return statusPhrase(leaf.status);
  }
}

/** Join phrases naturally: 'a', 'a and b', 'a, b and c'. */
function joinPhrases(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** One sentence for a top-level effect. */
function effectLine(effect: Effect): string {
  switch (effect.type) {
    case 'projectile': {
      const what = `${joinPhrases(effect.onHit.map(leafPhrase))}`;
      return (effect.count ?? 1) > 1
        ? `Fires ${effect.count} projectiles that each ${what}.`
        : `Fires a projectile that ${what}.`;
    }
    case 'aoe': {
      const where =
        effect.at === 'point'
          ? `at the target area (radius ${effect.radius})`
          : effect.at === 'unit'
            ? `on the target`
            : `around you (radius ${effect.radius})`;
      return `Bursts ${where}, ${joinPhrases(effect.onHit.map(leafPhrase))}.`;
    }
    case 'dash':
      return `Dashes ${effect.distance} units in the aimed direction.`;
    default: {
      // A bare leaf — capitalize its phrase into a sentence.
      const p = leafPhrase(effect);
      return `${p.charAt(0).toUpperCase()}${p.slice(1)}.`;
    }
  }
}

/** Build the full tooltip model for an ability. */
export function describeAbility(def: AbilityDef): AbilityTooltip {
  const lines = def.effects.map(effectLine);
  // Channelled abilities carry no `effects` (the server runs them as a sustained
  // beam); describe them from their channel fields instead.
  if (def.channelMs) {
    lines.push(
      `Channels a ${def.range}-long beam for ${secs(def.channelMs)}s, dealing ${def.damage} damage every ${secs(def.channelTickMs ?? 500)}s to enemies in its path. Move and re-aim freely; re-press to stop.`,
    );
  }
  return {
    name: def.name,
    aimLabel: def.channelMs ? 'Channelled' : AIM_LABEL[def.aim ?? 'self'],
    cooldownMs: def.cooldownMs,
    manaCost: def.manaCost,
    castTimeMs: def.castTimeMs,
    range: def.range,
    lines,
  };
}
