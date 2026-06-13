import { create } from 'zustand';
import { audioEngine } from '../audio/engine';

/**
 * Audio settings — the single reactive source of truth for master volume + mute.
 * Setters push the new value into the imperative `audioEngine` (the sink) and
 * persist it, mirroring the `"1"/"0"` localStorage convention in `useHudStore`
 * (extended with a numeric helper for the volume).
 *
 * Kept separate from `useHudStore` (HUD-chrome ownership) on purpose: volume is
 * numeric, and this store will grow per-category sliders (music/SFX) once the
 * engine's sub-buses are exposed.
 */

const KEY = {
  masterVolume: 'audio.master.volume',
  muted: 'audio.muted',
} as const;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Read a persisted 0–1 number, falling back when unset/invalid/unavailable. */
function loadNumber(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? clamp01(n) : fallback;
  } catch {
    return fallback;
  }
}

function saveNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage blocked — value only lasts this session */
  }
}

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function saveBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* storage blocked */
  }
}

interface AudioStore {
  /** Master volume, 0–1. */
  masterVolume: number;
  muted: boolean;
  setMasterVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  toggleMuted: () => void;
}

const initialVolume = loadNumber(KEY.masterVolume, 0.6);
const initialMuted = loadBool(KEY.muted, false);

// Seed the engine with the persisted settings so the first gesture-unlock starts
// playback at the right level (the engine applies these once its graph exists).
audioEngine.setMasterVolume(initialVolume);
audioEngine.setMuted(initialMuted);

export const useAudioStore = create<AudioStore>((set, get) => ({
  masterVolume: initialVolume,
  muted: initialMuted,
  setMasterVolume: (v) => {
    const masterVolume = clamp01(v);
    saveNumber(KEY.masterVolume, masterVolume);
    audioEngine.setMasterVolume(masterVolume);
    set({ masterVolume });
  },
  setMuted: (muted) => {
    saveBool(KEY.muted, muted);
    audioEngine.setMuted(muted);
    set({ muted });
  },
  toggleMuted: () => get().setMuted(!get().muted),
}));
