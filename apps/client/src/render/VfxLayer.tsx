import { useEffectsStore } from '../store/useEffectsStore';
import { assets } from '../assets/registry';
import { Vfx } from './Vfx';

/** Renders all active transient effects; each removes itself when its lifetime ends. */
export function VfxLayer() {
  const effects = useEffectsStore((s) => s.effects);
  const remove = useEffectsStore((s) => s.remove);

  return (
    <>
      {effects.map((effect) => {
        const descriptor = assets.getVfx(effect.vfxId);
        if (!descriptor) return null;
        return (
          <Vfx
            key={effect.key}
            descriptor={descriptor}
            origin={effect.origin}
            direction={effect.direction}
            onComplete={() => remove(effect.key)}
          />
        );
      })}
    </>
  );
}
