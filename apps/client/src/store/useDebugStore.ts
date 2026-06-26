import { create } from 'zustand';

/**
 * Dev-only render toggles for performance bisection. Each flag HIDES one class of
 * thing so you can flip it off in the Leva "Perf Debug" panel and watch the FPS
 * meter to find what's actually costing frames. All default to `false` (show
 * everything), and the panel only mounts in dev, so production is unaffected.
 */
interface DebugState {
  /** Hide every entity's floating nameplate + HP bar (Billboard). */
  hideNameplates: boolean;
  /** Hide the transient combat VFX layer (explosions / novas / bursts). */
  hideVfx: boolean;
  /** Hide the arena point lights (burning barrels + pond braziers). */
  hideLights: boolean;
  /** Hide the glowing ground zones + traps (the green rings). */
  hideZones: boolean;
  /** Hide carried/ground pickables (molotovs / grenades). */
  hidePickables: boolean;
  /** Hide burning barrels (BarrelEntity). */
  hideBarrels: boolean;
  /** Hide oil drums / destructibles (DestructibleEntity). */
  hideDestructibles: boolean;
  /** Hide cover structures — trailers/houses, cars, dumpsters (CoverStructureEntity). */
  hideStructures: boolean;
  /** Hide the static merged scenery props (MapView: buildings/rocks/decor). */
  hideMapProps: boolean;
  /** Swap the fbm grass ground for a flat material (isolates ground-shader cost). */
  flatGround: boolean;
  set: (patch: Partial<DebugState>) => void;
}

export const useDebugStore = create<DebugState>((set) => ({
  hideNameplates: false,
  hideVfx: false,
  hideLights: false,
  hideZones: false,
  hidePickables: false,
  hideBarrels: false,
  hideDestructibles: false,
  hideStructures: false,
  hideMapProps: false,
  flatGround: false,
  set: (patch) => set(patch),
}));
