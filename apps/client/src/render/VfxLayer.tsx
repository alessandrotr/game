import { useEffectsStore } from '../store/useEffectsStore';
import { assets } from '../assets/registry';
import { Vfx } from './Vfx';
import { BURST_SHADERS } from './shaders';

/** Renders all active transient effects; each removes itself when its lifetime ends. */
export function VfxLayer() {
  const effects = useEffectsStore((s) => s.effects);
  const remove = useEffectsStore((s) => s.remove);

  return (
    <>
      {effects.map((effect) => {
        const descriptor = assets.getVfx(effect.vfxId);
        if (!descriptor) return null;
        const onComplete = () => remove(effect.key);

        // A registered burst shader owns its own animation + lifetime; otherwise
        // fall back to the descriptor-driven placeholder primitives.
        const Burst = BURST_SHADERS[effect.vfxId];
        if (Burst) {
          return (
            <group key={effect.key} position={effect.origin}>
              <Burst
                durationMs={descriptor.durationMs ?? 600}
                onComplete={onComplete}
                direction={effect.direction}
              />
            </group>
          );
        }

        return (
          <Vfx
            key={effect.key}
            descriptor={descriptor}
            origin={effect.origin}
            direction={effect.direction}
            onComplete={onComplete}
          />
        );
      })}
    </>
  );
}
