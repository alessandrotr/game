import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { useEffectsStore, type ActiveEffect } from '../store/useEffectsStore';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { sampleTransform, INTERP_DELAY_MS } from '../store/snapshotBuffer';
import { assets } from '../assets/registry';
import { Vfx } from './Vfx';
import { BURST_SHADERS } from './shaders';

/**
 * Anchors a burst at `origin`, or — when the effect has a `followId` — tracks
 * that entity's live position each frame so body-centered casts (cleave, nova,
 * heal) stay glued to the character as it moves. Matches how PlayerEntity
 * renders the tracked body: predicted transform for the local player, the
 * interpolated snapshot for remotes; the height stays at the spawn `origin.y`.
 */
function EffectAnchor({ effect, children }: { effect: ActiveEffect; children: ReactNode }) {
  const ref = useRef<Group>(null);

  useFrame(() => {
    const g = ref.current;
    const id = effect.followId;
    if (!g || !id) return;

    const local = getLocalRenderTransform();
    if (local.active && useGameStore.getState().sessionId === id) {
      g.position.set(local.x, effect.origin[1], local.z);
      return;
    }
    const s = sampleTransform(id, performance.now() - INTERP_DELAY_MS);
    if (s) g.position.set(s.x, effect.origin[1], s.z);
    else {
      const p = useGameStore.getState().players.get(id);
      if (p) g.position.set(p.x, effect.origin[1], p.z);
    }
  });

  return (
    <group ref={ref} position={effect.origin}>
      {children}
    </group>
  );
}

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
            <EffectAnchor key={effect.key} effect={effect}>
              <Burst
                durationMs={descriptor.durationMs ?? 600}
                onComplete={onComplete}
                direction={effect.direction}
              />
            </EffectAnchor>
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
