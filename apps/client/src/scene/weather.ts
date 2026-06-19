import type { FocusPanel } from '../store/useFocusStore';
import type { EnvConfig } from '../tuning/useEnvStore';

/**
 * Per-focus-scene "weather". Each cinematic focus gives the town its own sky: the
 * leaderboard basks in bright blue noon, the duel shrine burns under a blood-red
 * sunset, and the Breach broods under a cold storm with rain. {@link TownAtmosphere}
 * smoothly lerps the live town environment toward the active panel's atmosphere
 * (and back when focus clears), so the mood swings in with the camera.
 *
 * Fog near/far are MULTIPLIERS over the town's tuned base, so a preset stays
 * proportional to the map size; colors/intensities are absolute targets.
 */
export interface Atmosphere {
  background: string;
  fogColor: string;
  /** Multipliers over the base town fog distances (clearer > 1, denser < 1). */
  fogNearMul: number;
  fogFarMul: number;
  ambient: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunColor: string;
  sunIntensity: number;
  /** Sun (key light) world position — lerped, and ALSO where the visible sun disc
   *  sits (placed far along this direction), so the light comes from the sun you
   *  see. The leaderboard sun rides high + back so it reads behind the podium. */
  sunPosition: [number, number, number];
  /** Visible sun disc opacity 0–1 (0 = hidden, e.g. the overcast storm). */
  sunDisc: number;
  /** Rain intensity 0–1 (drives the rain layer's density/opacity). */
  rain: number;
}

/** The town's own tuned look as an atmosphere (the "no focus" target). */
export function baseAtmosphere(env: EnvConfig): Atmosphere {
  return {
    background: env.background,
    fogColor: env.fogColor,
    fogNearMul: 1,
    fogFarMul: 1,
    ambient: env.ambient,
    hemiSky: env.hemiSky,
    hemiGround: env.hemiGround,
    hemiIntensity: env.hemiIntensity,
    sunColor: env.sunColor,
    sunIntensity: env.sunIntensity,
    sunPosition: env.sunPosition,
    sunDisc: 0,
    rain: 0,
  };
}

export const FOCUS_WEATHER: Record<FocusPanel, Atmosphere> = {
  // Hall of Champions — clear sunny day: a deep (not white-blown) blue sky so the
  // gold HUD title + panel stay legible, with the sun risen to high noon.
  leaderboard: {
    background: '#5a9fe0',
    fogColor: '#9cc6ec',
    fogNearMul: 1.5,
    fogFarMul: 1.8,
    ambient: 0.3,
    hemiSky: '#b3d7f5',
    hemiGround: '#7e9a61',
    hemiIntensity: 0.75,
    sunColor: '#fff1cc',
    sunIntensity: 1.35,
    // LOW in the sky (~8° elevation): the focus camera looks slightly down at the
    // podium, so the visible sky band is only ~0–12° up — a higher sun lands above
    // the frame. Biased a touch right (the framing shifts the podium screen-left,
    // so the camera aims at open sky to its right). The light rakes in low + warm.
    sunPosition: [16, 2.6, -10],
    sunDisc: 1,
    rain: 0,
  },
  // Trial of Blades — blood-red sunset: low warm sun, burnt-orange haze, the sky
  // smoldering behind the shrine.
  pvp: {
    background: '#5d2a30',
    fogColor: '#9b3f2c',
    fogNearMul: 0.95,
    fogFarMul: 1.3,
    ambient: 0.24,
    hemiSky: '#cb5f3a',
    hemiGround: '#3a2420',
    hemiIntensity: 0.7,
    sunColor: '#ff7a3c',
    sunIntensity: 1.5,
    sunPosition: [20, 6, 9], // low on the horizon — a setting sun
    sunDisc: 0.9, // a big red sun low in the sky
    rain: 0,
  },
  // The Breach — cold storm: leaden dark sky, dense fog closing in, dim blue light,
  // and rain pouring over the rift.
  coop: {
    background: '#1b2130',
    fogColor: '#232b3a',
    fogNearMul: 0.5,
    fogFarMul: 0.85,
    ambient: 0.18,
    hemiSky: '#3b4458',
    hemiGround: '#22252d',
    hemiIntensity: 0.5,
    sunColor: '#8b94a8',
    sunIntensity: 0.45,
    sunPosition: [10, 16, 6],
    sunDisc: 0, // overcast — no sun through the storm
    rain: 1,
  },
};
