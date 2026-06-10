import { create } from 'zustand';
import type { Vec3, VfxAssetId } from '@arena/shared';

export interface ActiveEffect {
  key: number;
  vfxId: VfxAssetId;
  origin: Vec3;
  direction: Vec3;
}

interface EffectsStore {
  effects: ActiveEffect[];
  spawn: (vfxId: VfxAssetId, origin: Vec3, direction?: Vec3) => void;
  remove: (key: number) => void;
}

let nextKey = 1;

/**
 * Transient client-side VFX instances. This is a local showcase of the VFX
 * pipeline — real abilities should be server-authoritative and replicated.
 */
export const useEffectsStore = create<EffectsStore>((set) => ({
  effects: [],
  spawn: (vfxId, origin, direction = [0, 0, 1]) =>
    set((s) => ({ effects: [...s.effects, { key: nextKey++, vfxId, origin, direction }] })),
  remove: (key) => set((s) => ({ effects: s.effects.filter((e) => e.key !== key) })),
}));
