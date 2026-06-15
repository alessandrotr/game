import { useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import type { AssetId } from '@arena/shared';
import { Vector3, type Group, type Mesh } from 'three';
import { useGameStore } from '../store/useGameStore';
import { useTargetStore } from '../store/targetState';
import { clearDestination } from '../store/destinationState';
import { sendAttack } from '../network/colyseus';
import { AssetInstance } from '../render/AssetInstance';
import { CarSmoke, CarFire } from '../render/shaders';

/** Cars (and only cars) smoke as they're worn down and burn near death. */
type DamageStage = 'none' | 'smoke' | 'fire';

/** A wheel (a torus tyre) rolls about its axle — the torus's local-Z symmetry
 *  axis — so {@link Group.rotateOnAxis} with this spins it in place. */
const WHEEL_AXIS = new Vector3(0, 0, 1);
/** Radians of wheel spin per unit the car rolls forward. A true roll would be
 *  1/radius (≈2.5), but that reads as a strobe on the small faceted wheels — so
 *  it's dialled down and negated so the wheels turn the way the car travels. */
const WHEEL_SPIN_PER_UNIT = -1.1;

/**
 * A destructible cover structure (trailer="house" / car / dumpster) rendered
 * from replicated state. It stands and blocks while alive; once the server marks
 * it `destroyed` it's squashed flat into rubble and stops colliding. An invisible
 * collider makes a standing structure left-clickable to auto-attack it.
 *
 * A floating HP bar appears only once the structure is damaged (hidden at full
 * HP and after it crumbles). The bar is updated imperatively each frame from the
 * latest snapshot, so it tracks chip damage without per-tick React re-renders;
 * the component itself only re-renders when a structure crumbles.
 */
const BAR_FILL = '#f4a64a'; // amber "integrity", distinct from player green

export function CoverStructureEntity({ structureId }: { structureId: string }) {
  // Re-render when any structure crumbles (structureObstacles changes then).
  useGameStore((s) => s.structureObstacles);
  const s = useGameStore.getState().structures.get(structureId);

  const hpBar = useRef<Group>(null);
  const hpFill = useRef<Mesh>(null);
  // Bar width scales with the structure's footprint (bigger cover, wider bar).
  const barWidth = s ? Math.min(2.4, Math.max(0.9, s.radius * 1.3)) : 1;

  // Cars accrue smoke (< 50% HP) then fire (< 20% HP). Tracked in a ref and
  // promoted to state only when the band changes, so a worn-down car re-renders
  // once per transition rather than every tick.
  const isCar = !!s && s.assetId.includes('car');
  const [stage, setStage] = useState<DamageStage>('none');
  const stageRef = useRef<DamageStage>('none');

  // Cars roll when shot: the server slides them, so we follow the replicated
  // transform each frame (the component only re-renders on crumble) and spin the
  // wheels by how far the car travelled along its length.
  const root = useRef<Group>(null);
  const carGroup = useRef<Group>(null);
  const wheels = useRef<Mesh[] | null>(null);
  const prevPos = useRef<{ x: number; z: number } | null>(null);

  useFrame(() => {
    const cur = useGameStore.getState().structures.get(structureId);
    if (!cur || !hpBar.current) return;

    // Follow the (server-driven) car position and roll the wheels.
    if (isCar && root.current) {
      root.current.position.x = cur.x;
      root.current.position.z = cur.z;
      // Lazily collect the named wheel meshes once the prop has mounted.
      if (!wheels.current && carGroup.current) {
        const found: Mesh[] = [];
        carGroup.current.traverse((o) => {
          if (o.name === 'wheel') found.push(o as Mesh);
        });
        if (found.length) wheels.current = found;
      }
      const prev = prevPos.current;
      if (prev && wheels.current) {
        // Distance rolled along the car's length (forward axis from its yaw).
        const fwd = (cur.x - prev.x) * Math.cos(cur.rotation) - (cur.z - prev.z) * Math.sin(cur.rotation);
        if (Math.abs(fwd) > 1e-5) {
          const spin = fwd * WHEEL_SPIN_PER_UNIT;
          for (const w of wheels.current) w.rotateOnAxis(WHEEL_AXIS, spin);
        }
      }
      prevPos.current = { x: cur.x, z: cur.z };
    }
    // Show only while damaged and still standing.
    const damaged = !cur.destroyed && cur.hp > 0 && cur.hp < cur.maxHp;
    hpBar.current.visible = damaged;
    if (damaged && hpFill.current) {
      const ratio = Math.min(1, Math.max(0, cur.hp / cur.maxHp));
      hpFill.current.scale.x = Math.max(0.001, ratio);
      hpFill.current.position.x = -(barWidth * (1 - ratio)) / 2;
    }
    if (isCar) {
      const ratio = cur.hp / cur.maxHp;
      const next: DamageStage =
        cur.destroyed || cur.hp <= 0 ? 'none' : ratio <= 0.2 ? 'fire' : ratio <= 0.5 ? 'smoke' : 'none';
      if (next !== stageRef.current) {
        stageRef.current = next;
        setStage(next);
      }
    }
  });

  const onAttack = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    clearDestination();
    sendAttack(structureId);
    useTargetStore.getState().setTarget(structureId);
  };

  if (!s) return null;
  return (
    <group
      ref={root}
      position={[s.x, 0, s.z]}
      rotation={[0, s.rotation, 0]}
      // Crumbled: squash flat into a low rubble footprint.
      scale={[1, s.destroyed ? 0.18 : 1, 1]}
    >
      {isCar ? (
        <group ref={carGroup}>
          <AssetInstance id={s.assetId as AssetId} />
        </group>
      ) : (
        // Stretch only the visual along the prop's local length (X) axis — the
        // circular collider + HP bar (siblings) keep the base footprint, so a
        // longer trailer is never wider.
        <group scale={[s.lengthScale, 1, 1]}>
          <AssetInstance id={s.assetId as AssetId} />
        </group>
      )}
      {isCar && stage === 'smoke' && <CarSmoke height={s.height} radius={s.radius} />}
      {isCar && stage === 'fire' && <CarFire height={s.height} radius={s.radius} />}
      {!s.destroyed && (
        <mesh position={[0, s.height / 2, 0]} onPointerDown={onAttack}>
          <cylinderGeometry args={[s.radius, s.radius, s.height, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {/* Floating integrity bar — billboarded above the structure, shown only
          once it's taken damage (visibility toggled in useFrame). */}
      <Billboard position={[0, s.height + 0.5, 0]}>
        <group ref={hpBar} visible={false}>
          <mesh>
            <planeGeometry args={[barWidth, 0.14]} />
            <meshBasicMaterial color="#1a1f2e" />
          </mesh>
          <mesh ref={hpFill} position={[0, 0, 0.001]}>
            <planeGeometry args={[barWidth, 0.11]} />
            <meshBasicMaterial color={BAR_FILL} />
          </mesh>
        </group>
      </Billboard>
    </group>
  );
}
