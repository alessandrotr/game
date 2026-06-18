import { create } from 'zustand';
import type { Vec3, VfxAssetId } from '@arena/shared';
import { useQualityStore } from './useQualityStore';

export interface ActiveEffect {
  key: number;
  vfxId: VfxAssetId;
  origin: Vec3;
  direction: Vec3;
  /** Session id of an entity this effect tracks over its lifetime (body-centered
   *  casts like cleave/nova/heal follow the caster); undefined = pinned to
   *  `origin` (ground impacts stay where they landed). */
  followId?: string;
  /** When following, keep the effect this many units in front of the tracked
   *  entity along `direction` (e.g. a frontal smash that stays ahead while you run). */
  offset?: number;
}

interface EffectsStore {
  effects: ActiveEffect[];
  spawn: (vfxId: VfxAssetId, origin: Vec3, direction?: Vec3, followId?: string, offset?: number) => void;
  remove: (key: number) => void;
}

let nextKey = 1;

/**
 * Transient client-side VFX instances. This is a local showcase of the VFX
 * pipeline — real abilities should be server-authoritative and replicated.
 */
export const useEffectsStore = create<EffectsStore>((set) => ({
  effects: [],
  spawn: (vfxId, origin, direction = [0, 0, 1], followId, offset) =>
    set((s) => {
      const next = [...s.effects, { key: nextKey++, vfxId, origin, direction, followId, offset }];
      // Cap concurrent effects per the quality tier — a big multi-target blast can
      // spawn many overlapping additive bursts at once. Drop the OLDEST (already
      // fading) so the just-triggered effect always shows.
      const max = useQualityStore.getState().settings.maxEffects;
      return { effects: next.length > max ? next.slice(next.length - max) : next };
    }),
  remove: (key) => set((s) => ({ effects: s.effects.filter((e) => e.key !== key) })),
}));
