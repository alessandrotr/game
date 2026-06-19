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
    rain: 0,
  };
}

export const FOCUS_WEATHER: Record<FocusPanel, Atmosphere> = {
  // Hall of Champions — clear, bright noon: high blue sky, sun blazing, fog pushed
  // far so the plaza reads crisp and triumphant.
  leaderboard: {
    background: '#86c5ff',
    fogColor: '#c6e7ff',
    fogNearMul: 1.7,
    fogFarMul: 1.9,
    ambient: 0.52,
    hemiSky: '#d2ecff',
    hemiGround: '#7e9a61',
    hemiIntensity: 1.0,
    sunColor: '#fff3d4',
    sunIntensity: 2.0,
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
    rain: 1,
  },
};
