import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { ABILITIES } from '@arena/shared';
import { useAbilityTargeting } from '../store/abilityTargeting';
import { getCursorGround } from '../store/cursorState';
import { getLocalRenderTransform } from '../store/localPlayer';

/**
 * The on-ground aim indicator for the ability you're currently holding to aim:
 * a **line** from the player toward the cursor for `direction` skillshots, or a
 * **ring** under the cursor for `point` ground-targets. Both follow the cursor
 * and clamp to the ability's range. Purely visual — `useAbilityHotkeys` fires on
 * key release; right-click / Esc cancel.
 */
export function GroundTargeter() {
  const pending = useAbilityTargeting((s) => s.pending);
  const line = useRef<Group>(null);
  const ring = useRef<Mesh>(null);

  useFrame(() => {
    if (!pending) return;
    const config = ABILITIES[pending];
    const me = getLocalRenderTransform();
    const cur = getCursorGround();
    let dx = cur.x - me.x;
    let dz = cur.z - me.z;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist;
    dz /= dist;
    const reach = Math.min(dist, config.range);

    if (config.aim === 'direction' && line.current) {
      const len = Math.max(0.5, reach);
      line.current.position.set(me.x + dx * (len / 2), 0.05, me.z + dz * (len / 2));
      line.current.rotation.y = Math.atan2(dx, dz);
      line.current.scale.z = len;
    } else if (config.aim === 'point' && ring.current) {
      ring.current.position.set(me.x + dx * reach, 0.05, me.z + dz * reach);
    }
  });

  if (!pending) return null;
  const config = ABILITIES[pending];

  if (config.aim === 'direction') {
    return (
      <group ref={line}>
        {/* Unit-length bar along local +Z, scaled to reach in useFrame. */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.5, 0.02, 1]} />
          <meshBasicMaterial color="#ffce6b" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  const radius = config.aoeRadius ?? 2;
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <ringGeometry args={[Math.max(0.1, radius - 0.25), radius, 48]} />
      <meshBasicMaterial color="#b07bff" transparent opacity={0.8} depthWrite={false} />
    </mesh>
  );
}
