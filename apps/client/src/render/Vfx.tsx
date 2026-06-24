import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import type { Vec3, VfxDescriptor } from '@arena/shared';
import { AssetMesh } from './AssetMesh';

interface VfxProps {
  descriptor: VfxDescriptor;
  origin?: Vec3;
  /** Travel direction for `projectile` behavior (need not be normalized). */
  direction?: Vec3;
  /** Called once the effect's lifetime elapses. */
  onComplete?: () => void;
}

/**
 * Renders and animates a single VFX instance according to its behavior:
 * projectiles travel, bursts expand, auras pulse, and static effects spin.
 */
export function Vfx({
  descriptor,
  origin = [0, 0, 0],
  direction = [0, 0, 1],
  onComplete,
}: VfxProps) {
  const group = useRef<Group>(null);
  const elapsed = useRef(0);
  const velocity = useRef(
    new Vector3(...direction).normalize().multiplyScalar(descriptor.speed ?? 0),
  );
  const done = useRef(false);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node || done.current) return;
    elapsed.current += delta * 1000;

    switch (descriptor.behavior) {
      case 'projectile':
        node.position.addScaledVector(velocity.current, delta);
        if (descriptor.id === 'vfx.shuriken') {
          node.rotation.z += delta * 25; // fast spin animation
        }
        break;
      case 'burst': {
        const t = descriptor.durationMs ? elapsed.current / descriptor.durationMs : 0;
        node.scale.setScalar(0.2 + t * 1.6);
        break;
      }
      case 'aura':
        node.scale.setScalar(1 + Math.sin(elapsed.current * 0.006) * 0.1);
        break;
      case 'static':
        node.rotation.z += delta * 0.6;
        break;
    }

    if (descriptor.durationMs && elapsed.current >= descriptor.durationMs && onComplete) {
      done.current = true;
      onComplete();
    }
  });

  const rotationY = Math.atan2(direction[0], direction[2]);

  return (
    <group ref={group} position={origin} rotation={[0, rotationY, 0]}>
      <AssetMesh source={descriptor.render} />
    </group>
  );
}
