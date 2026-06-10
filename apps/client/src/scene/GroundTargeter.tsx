import { useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Mesh } from 'three';
import { ABILITIES, ARENA_HALF_SIZE } from '@arena/shared';
import { useAbilityTargeting } from '../store/abilityTargeting';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { sendCast } from '../network/colyseus';
import { triggerCooldown } from '../store/abilityCooldowns';
import { pushAnimationEvent } from '../render/animation/animationEvents';

const SIZE = ARENA_HALF_SIZE * 2;

/**
 * When a ground-targeted ability is pending, this lays an invisible ground plane
 * that tracks the cursor (showing an AoE ring sized to the ability) and casts at
 * the clicked point. The plane sits behind player hitboxes but, because those
 * hitboxes don't `stopPropagation` while targeting, the click falls through to
 * here — so clicking on or near an enemy still places the blast.
 */
export function GroundTargeter() {
  const pending = useAbilityTargeting((s) => s.pending);
  const ring = useRef<Mesh>(null);

  if (!pending) return null;
  const config = ABILITIES[pending];
  const radius = config.aoeRadius ?? 2;

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (ring.current) ring.current.position.set(e.point.x, 0.04, e.point.z);
  };

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return; // left-click places
    e.stopPropagation();
    const me = getLocalRenderTransform();
    const dx = e.point.x - me.x;
    const dz = e.point.z - me.z;
    const len = Math.hypot(dx, dz) || 1;
    sendCast(pending, dx / len, dz / len, e.point.x, e.point.z);
    triggerCooldown(pending, config.cooldownMs);
    const localId = useGameStore.getState().sessionId;
    if (localId) pushAnimationEvent(localId, 'cast');
    useAbilityTargeting.getState().cancel();
  };

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        onPointerMove={onMove}
        onPointerDown={onDown}
      >
        <planeGeometry args={[SIZE, SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[Math.max(0.1, radius - 0.25), radius, 48]} />
        <meshBasicMaterial color="#b07bff" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}
