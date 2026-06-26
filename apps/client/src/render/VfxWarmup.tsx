import { Preload } from '@react-three/drei';
import { BURST_SHADERS, PROJECTILE_SHADERS } from './shaders';

/**
 * GPU warm-up for the combat shaders (explosions, novas, slashes, projectiles …).
 *
 * Each effect is a `shaderMaterial` built from a unique fragment string (and, for
 * the energy-arrow projectiles, a lit `meshStandardMaterial`), so its GPU program
 * compiles the FIRST time that effect plays — which hitches the frame mid-combat
 * (the "explosions sometimes lag" symptom; on Windows/Chrome the ANGLE→D3D
 * compile is slow enough to read as a camera jitter, e.g. the archer's power /
 * pinning shots). This mounts one hidden instance of every burst AND projectile
 * shader far off-screen and runs drei's `<Preload all />` (a `gl.compile` pass),
 * so all the programs compile up front at arena load instead of during a fight.
 * The instances are off-screen (culled) and cost effectively nothing after that.
 */
const NOOP = () => {};

export function VfxWarmup() {
  const bursts = Object.entries(BURST_SHADERS);
  const projectiles = Object.entries(PROJECTILE_SHADERS);
  return (
    <group position={[0, -1000, 0]}>
      {bursts.map(([id, Burst]) =>
        Burst ? (
          <Burst key={id} durationMs={1e9} direction={[0, 0, 1]} onComplete={NOOP} />
        ) : null,
      )}
      {projectiles.map(([id, Projectile]) =>
        Projectile ? <Projectile key={id} /> : null,
      )}
      <Preload all />
    </group>
  );
}
