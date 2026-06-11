import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, DoubleSide, Shape, Vector3, type Group, type Mesh } from 'three';
import { ABILITIES } from '@arena/shared';
import { useAbilityTargeting } from '../store/abilityTargeting';
import { getCursorGround } from '../store/cursorState';
import { getLocalRenderTransform } from '../store/localPlayer';

const DIRECTION_COLOR = '#ffce6b';
const AREA_COLOR = '#b07bff';

/**
 * The on-ground aim indicator for the ability you're currently holding to aim,
 * styled after League of Legends spell indicators:
 *
 * - `direction` skillshots → a transparent **arrow** rooted at the caster,
 *   always the full length of the ability's range, rotating to point at the
 *   cursor (a "line missile" indicator).
 * - `point` ground-targets → a **range circle** drawn around the caster plus an
 *   **area target** disc that follows the cursor, clamped to the range circle.
 *
 * Purely visual — `useAbilityHotkeys` fires on key release; right-click / Esc
 * cancel.
 */

/** Flat arrow outline pointing along local +Y, from the origin out to `length`. */
function makeArrowShape(length: number): Shape {
  const shaftW = 0.26;
  const headW = 0.8;
  const headLen = Math.min(1.4, Math.max(0.5, length * 0.22));
  const shaftLen = Math.max(0.01, length - headLen);
  const s = new Shape();
  s.moveTo(-shaftW / 2, 0);
  s.lineTo(-shaftW / 2, shaftLen);
  s.lineTo(-headW / 2, shaftLen);
  s.lineTo(0, length);
  s.lineTo(headW / 2, shaftLen);
  s.lineTo(shaftW / 2, shaftLen);
  s.lineTo(shaftW / 2, 0);
  s.closePath();
  return s;
}

export function GroundTargeter() {
  const pending = useAbilityTargeting((s) => s.pending);

  const dirGroup = useRef<Group>(null);
  const rangeRing = useRef<Mesh>(null);
  const target = useRef<Group>(null);

  // The arrow's length equals the ability's range and never changes per frame,
  // so build its geometry once per pending ability.
  const arrow = useMemo(() => {
    if (!pending) return null;
    const cfg = ABILITIES[pending];
    if (cfg.aim !== 'direction') return null;
    // Skillshots are projectiles: the true reach is how far the projectile flies
    // (`projectileRange`), not the larger `range` field used for UI/decisions.
    const shape = makeArrowShape(cfg.projectileRange ?? cfg.range);
    const outline = new BufferGeometry().setFromPoints(
      shape.getPoints().map((p) => new Vector3(p.x, p.y, 0)),
    );
    return { shape, outline };
  }, [pending]);

  useFrame(() => {
    if (!pending) return;
    const cfg = ABILITIES[pending];
    const me = getLocalRenderTransform();
    const cur = getCursorGround();
    let dx = cur.x - me.x;
    let dz = cur.z - me.z;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist;
    dz /= dist;

    if (cfg.aim === 'direction' && dirGroup.current) {
      dirGroup.current.position.set(me.x, 0.05, me.z);
      dirGroup.current.rotation.y = Math.atan2(dx, dz);
    } else if (cfg.aim === 'point') {
      const reach = Math.min(dist, cfg.range);
      if (rangeRing.current) rangeRing.current.position.set(me.x, 0.04, me.z);
      if (target.current) target.current.position.set(me.x + dx * reach, 0.05, me.z + dz * reach);
    }
  });

  if (!pending) return null;
  const cfg = ABILITIES[pending];

  if (cfg.aim === 'direction' && arrow) {
    return (
      <group ref={dirGroup}>
        {/* Lay the arrow flat on the ground, forward pointing along +Z. */}
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <shapeGeometry args={[arrow.shape]} />
            <meshBasicMaterial
              color={DIRECTION_COLOR}
              transparent
              opacity={0.18}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
          <lineLoop>
            <primitive object={arrow.outline} attach="geometry" />
            <lineBasicMaterial color={DIRECTION_COLOR} transparent opacity={0.9} depthWrite={false} />
          </lineLoop>
        </group>
      </group>
    );
  }

  // point / area target
  const radius = cfg.aoeRadius ?? 2;
  const range = cfg.range;
  return (
    <>
      {/* Max-range circle around the caster. */}
      <mesh ref={rangeRing} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[Math.max(0.05, range - 0.08), range, 96]} />
        <meshBasicMaterial color={AREA_COLOR} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {/* Area-of-effect target following the cursor (clamped to range). */}
      <group ref={target}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[radius, 64]} />
          <meshBasicMaterial color={AREA_COLOR} transparent opacity={0.12} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(0.05, radius - 0.1), radius, 64]} />
          <meshBasicMaterial color={AREA_COLOR} transparent opacity={0.85} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
