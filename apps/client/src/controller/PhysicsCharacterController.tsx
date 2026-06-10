import { useRef, type ReactNode } from 'react';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import type { Group } from 'three';
import type { CharacterControllerConfig } from './config';
import { useRapierCharacterController } from './useRapierCharacterController';
import { FollowCamera } from './FollowCamera';

// Capsule body dimensions (must match the collider).
const RADIUS = 0.4;
const CYLINDER_HALF_HEIGHT = 0.4; // half of the straight section
const CENTER_Y = RADIUS + CYLINDER_HALF_HEIGHT; // capsule center above the feet

interface PhysicsCharacterControllerProps {
  config?: Partial<CharacterControllerConfig>;
  /** Spawn position (feet). */
  position?: [number, number, number];
  /** Custom visual mounted at the body origin (feet). Defaults to a capsule. */
  children?: ReactNode;
  followCamera?: boolean;
  cameraOffset?: [number, number, number];
}

/**
 * Drop-in physics character: WASD + Shift sprint + Space jump driven through a
 * Rapier kinematic-position RigidBody with a capsule collider, with a smooth
 * follow camera. Must be rendered inside a `<Physics>` provider.
 *
 * ```tsx
 * <Canvas><Physics><PhysicsCharacterController /></Physics></Canvas>
 * ```
 */
export function PhysicsCharacterController({
  config,
  position = [0, 0, 0],
  children,
  followCamera = true,
  cameraOffset,
}: PhysicsCharacterControllerProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<Group>(null);
  const cameraTargetRef = useRef<Group>(null);

  useRapierCharacterController({ bodyRef, visualRef, cameraTargetRef, overrides: config });

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        enabledRotations={[false, false, false]}
        position={position}
      >
        <CapsuleCollider args={[CYLINDER_HALF_HEIGHT, RADIUS]} position={[0, CENTER_Y, 0]} />
        <group ref={visualRef}>{children ?? <DefaultBody />}</group>
      </RigidBody>

      {/* Root-level target the controller syncs to the resolved body position. */}
      <group ref={cameraTargetRef} />
      {followCamera && <FollowCamera target={cameraTargetRef} offset={cameraOffset} />}
    </>
  );
}

/** Placeholder capsule body, offset so its feet sit at the group origin. */
function DefaultBody() {
  return (
    <mesh position={[0, CENTER_Y, 0]} castShadow>
      <capsuleGeometry args={[RADIUS, CYLINDER_HALF_HEIGHT * 2, 8, 16]} />
      <meshStandardMaterial color="#6c8cff" roughness={0.4} metalness={0.1} />
    </mesh>
  );
}
