import { describe, expect, it } from 'vitest';
import { ZOMBIE_MODE } from '@arena/shared';
import {
  resolveGameMode,
  deathPolicy,
  FFA_MODE,
  RANKED_MODE,
  ZOMBIE_SURVIVAL_MODE,
  ZOMBIE_COOP_MODE,
} from './modes';

// These tests double as the living spec for the game-mode system: what each
// mode means, and how the room picks one from its `onCreate` options. Adding a
// new mode? Add it here too — the test then documents + guards its behaviour.

describe('resolveGameMode', () => {
  it('defaults to FFA when no mode is given', () => {
    expect(resolveGameMode(undefined)).toBe(FFA_MODE);
    expect(resolveGameMode({})).toBe(FFA_MODE);
  });

  it('maps a ranked lobby mode (1v1…5v5) to RANKED', () => {
    expect(resolveGameMode({ mode: '3v3' })).toBe(RANKED_MODE);
    expect(resolveGameMode({ mode: '1v1' })).toBe(RANKED_MODE);
  });

  it('maps zombie options to the right zombie variant', () => {
    expect(resolveGameMode({ mode: ZOMBIE_MODE })).toBe(ZOMBIE_SURVIVAL_MODE);
    expect(resolveGameMode({ mode: ZOMBIE_MODE, coop: true })).toBe(ZOMBIE_COOP_MODE);
  });
});

describe('game-mode capabilities (the contract each mode keeps)', () => {
  it('PvP modes (FFA, ranked): rectangle arena, respawn, manual attack, perks, chest; no zombies', () => {
    for (const m of [FFA_MODE, RANKED_MODE]) {
      expect(m.zombie).toBe(false);
      expect(m.respawns).toBe(true);
      expect(m.manualAttack).toBe(true);
      expect(m.usesPerks).toBe(true);
      expect(m.usesChest).toBe(true);
      expect(m.autoAttack).toBe(false);
      expect(m.roomExpansion).toBe(false);
      expect(m.walkSpeedPenalty).toBe(1);
    }
  });

  it('zombie survival: horde sim, forced auto-attack, perks, faster mana, no chest, respawns', () => {
    const m = ZOMBIE_SURVIVAL_MODE;
    expect(m.zombie).toBe(true);
    expect(m.autoAttack).toBe(true);
    expect(m.manualAttack).toBe(false);
    expect(m.usesPerks).toBe(true);
    expect(m.usesChest).toBe(false);
    expect(m.roomExpansion).toBe(true);
    expect(m.respawns).toBe(true);
    expect(m.manaRegenMult).toBeGreaterThan(FFA_MODE.manaRegenMult);
  });

  it('co-op survival: like survival, but death is final', () => {
    expect(ZOMBIE_COOP_MODE.zombie).toBe(true);
    expect(ZOMBIE_COOP_MODE.respawns).toBe(false);
    expect(ZOMBIE_COOP_MODE.roomExpansion).toBe(true);
  });
});

describe('deathPolicy (what death means per mode)', () => {
  it('PvP: everyone respawns (bots included)', () => {
    expect(deathPolicy(FFA_MODE, false)).toBe('respawn');
    expect(deathPolicy(FFA_MODE, true)).toBe('respawn');
    expect(deathPolicy(RANKED_MODE, false)).toBe('respawn');
  });

  it('zombie survival: a slain zombie (bot) is removed; humans respawn', () => {
    expect(deathPolicy(ZOMBIE_SURVIVAL_MODE, true)).toBe('remove');
    expect(deathPolicy(ZOMBIE_SURVIVAL_MODE, false)).toBe('respawn');
  });

  it('co-op: zombies removed, humans linger (no respawn)', () => {
    expect(deathPolicy(ZOMBIE_COOP_MODE, true)).toBe('remove');
    expect(deathPolicy(ZOMBIE_COOP_MODE, false)).toBe('linger');
  });
});
