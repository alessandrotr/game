import { Preload } from '@react-three/drei';
import { BURST_SHADERS } from './shaders';

/**
 * GPU warm-up for the combat burst shaders (explosions, novas, slashes, …).
 *
 * Each burst is a one-shot `shaderMaterial` built from a unique fragment string,
 * so its GPU program compiles the FIRST time that effect plays — which hitches
 * the frame mid-combat (the "explosions sometimes lag" symptom). This mounts one
 * hidden instance of every burst shader far off-screen and runs drei's
 * `<Preload all />` (a `gl.compile` pass), so all the programs compile up front
 * at arena load instead of during a fight. The instances are off-screen (culled)
 * and cost effectively nothing after that.
 */
const NOOP = () => {};

export function VfxWarmup() {
  const bursts = Object.entries(BURST_SHADERS);
  return (
    <group position={[0, -1000, 0]}>
      {bursts.map(([id, Burst]) =>
        Burst ? (
          <Burst key={id} durationMs={1e9} direction={[0, 0, 1]} onComplete={NOOP} />
        ) : null,
      )}
      <Preload all />
    </group>
  );
}
