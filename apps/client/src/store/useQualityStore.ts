import { create } from 'zustand';

/**
 * Graphics quality tiers — the knob that makes the game run on *any* machine.
 * Each tier scales the expensive levers: render resolution (dpr), shadows (the
 * single biggest GPU cost), shadow-map size, and the cosmetic fill/rim lights.
 *
 * The default is auto-detected from a light hardware heuristic on first load and
 * then persisted, so it's a one-time guess the player can always override in
 * Settings.
 */
export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  /** Renderer pixel-ratio clamp [min, max]. Low caps at 1.0 (huge win on Retina). */
  dpr: [number, number];
  /** Whether the sun casts shadows at all (off = no shadow depth pass). */
  shadows: boolean;
  /** Shadow depth-map resolution when shadows are on. */
  shadowMapSize: number;
  /** Render the cosmetic fill + rim lights (off on Low to save per-pixel work). */
  fillLights: boolean;
  /** Max simultaneous transient VFX. A big multi-target explosion can spawn many
   *  overlapping additive bursts at once; capping bounds the overdraw spike on
   *  weak GPUs (oldest are dropped, so the newest effect always shows). */
  maxEffects: number;
}

export const QUALITY_TIERS: Record<QualityTier, QualitySettings> = {
  low: { dpr: [0.7, 1.0], shadows: false, shadowMapSize: 512, fillLights: false, maxEffects: 12 },
  medium: { dpr: [1.0, 1.25], shadows: true, shadowMapSize: 1024, fillLights: true, maxEffects: 24 },
  high: { dpr: [1.0, 1.5], shadows: true, shadowMapSize: 2048, fillLights: true, maxEffects: 48 },
};

export const QUALITY_LABEL: Record<QualityTier, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const STORAGE_KEY = 'gfx-quality';

/** A cheap, conservative hardware guess: weak/mobile → Low, beefy → High. */
function detectTier(): QualityTier {
  if (typeof navigator === 'undefined') return 'medium';
  const cores = navigator.hardwareConcurrency ?? 4;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (mobile || cores <= 4) return 'low';
  if (cores >= 8 && dpr <= 1.5) return 'high';
  return 'medium';
}

function initialTier(): QualityTier {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  }
  return detectTier();
}

interface QualityState {
  tier: QualityTier;
  settings: QualitySettings;
  setTier: (tier: QualityTier) => void;
}

export const useQualityStore = create<QualityState>((set) => {
  const tier = initialTier();
  return {
    tier,
    settings: QUALITY_TIERS[tier],
    setTier: (tier) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, tier);
      set({ tier, settings: QUALITY_TIERS[tier] });
    },
  };
});
