import { create } from 'zustand';
import { ARENA_HALF_SIZE, TOWN_HALF_SIZE } from '@arena/shared';

/**
 * Live-tunable environment (lighting / shadows / fog / tone) per world. Plain
 * zustand so the scene reads it without importing Leva — the dev-tools panel
 * (Leva, lazy) writes here. Defaults mirror the hand-tuned values the scene
 * shipped with, so with dev tools off the look is unchanged.
 */
/** Tone-mapping operator: ACES (default), AgX (filmic, more realistic), or
 *  Khronos PBR Neutral (flattest). */
export type ToneMappingMode = 'aces' | 'agx' | 'neutral';

export interface EnvConfig {
  /** Output tone-mapping operator. */
  toneMapping: ToneMappingMode;
  /** Image-based-lighting (IBL) intensity from the procedural environment. */
  envIntensity: number;
  /** Grass (town): blade wind strength + the base/tip colour gradient. */
  grassWind: number;
  grassDark: string;
  grassLight: string;
  background: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambient: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunPosition: [number, number, number];
  sunIntensity: number;
  sunColor: string;
  fillPosition: [number, number, number];
  fillIntensity: number;
  fillColor: string;
  rimPosition: [number, number, number];
  rimIntensity: number;
  rimColor: string;
  shadowMapSize: number;
  shadowBias: number;
  shadowNormalBias: number;
  shadowExtent: number;
  exposure: number;
}

const TOWN: EnvConfig = {
  toneMapping: 'aces',
  envIntensity: 0.25,
  grassWind: 1,
  grassDark: '#3e5a30',
  grassLight: '#84a85e',
  background: '#4f4a66',
  fogColor: '#4f4a66',
  fogNear: TOWN_HALF_SIZE * 0.65,
  fogFar: TOWN_HALF_SIZE * 1.9,
  ambient: 0.16,
  hemiSky: '#6d72a4',
  hemiGround: '#40382a',
  hemiIntensity: 0.5,
  sunPosition: [16, 15, 9],
  sunIntensity: 1.15,
  sunColor: '#ffc078',
  fillPosition: [-14, 7, -6],
  fillIntensity: 0.4,
  fillColor: '#6f78b8',
  rimPosition: [-2, 11, -18],
  rimIntensity: 0.45,
  rimColor: '#ffd9a8',
  shadowMapSize: 1024,
  shadowBias: -0.0002,
  shadowNormalBias: 0.04,
  shadowExtent: 30,
  exposure: 1.1,
};

const ARENA: EnvConfig = {
  // Match the town: the arena now uses the same animated TownAtmosphere, so these
  // mirror the TOWN preset (a Britannia village look) — only fog distances and the
  // shadow extent are retuned for the smaller arena footprint.
  toneMapping: 'aces',
  envIntensity: 0.25,
  grassWind: 1,
  grassDark: '#3e5a30',
  grassLight: '#84a85e',
  background: '#060910', // deep dark-blue night sky
  fogColor: '#060910', // dark blue haze, pushed well back
  fogNear: ARENA_HALF_SIZE * 2.0,
  fogFar: 150,
  ambient: 0.16,
  hemiSky: '#6d72a4',
  hemiGround: '#40382a',
  hemiIntensity: 0.5,
  sunPosition: [16, 15, 9],
  sunIntensity: 1.15,
  sunColor: '#ffc078',
  fillPosition: [-14, 7, -6],
  fillIntensity: 0.4,
  fillColor: '#6f78b8',
  rimPosition: [-2, 11, -18],
  rimIntensity: 0.45,
  rimColor: '#ffd9a8',
  shadowMapSize: 1024,
  shadowBias: -0.0002,
  shadowNormalBias: 0.04,
  shadowExtent: ARENA_HALF_SIZE,
  exposure: 1.1,
};

export const ENV_DEFAULTS: Record<'town' | 'arena', EnvConfig> = { town: TOWN, arena: ARENA };

interface EnvStore {
  town: EnvConfig;
  arena: EnvConfig;
  set: (room: 'town' | 'arena', patch: Partial<EnvConfig>) => void;
  reset: () => void;
}

export const useEnvStore = create<EnvStore>((set) => ({
  town: { ...TOWN },
  arena: { ...ARENA },
  set: (room, patch) => set((s) => ({ [room]: { ...s[room], ...patch } }) as Partial<EnvStore>),
  reset: () => set({ town: { ...TOWN }, arena: { ...ARENA } }),
}));
