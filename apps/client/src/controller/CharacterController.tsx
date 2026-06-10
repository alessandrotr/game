import { useRef, type ReactNode } from 'react';
import { type Group } from 'three';
import type { CharacterControllerConfig } from './config';
import { useCharacterController } from './useCharacterController';
import { FollowCamera } from './FollowCamera';

interface CharacterControllerProps {
  /** Override any subset of the movement config. */
  config?: Partial<CharacterControllerConfig>;
  /** Spawn position (feet), defaults to the origin on the ground. */
  position?: [number, number, number];
  /** Custom visual mounted at the body origin (feet). Defaults to a capsule. */
  children?: ReactNode;
  /** Render and drive the built-in follow camera (default: true). */
  followCamera?: boolean;
  /** Follow-camera offset, forwarded to {@link FollowCamera}. */
  cameraOffset?: [number, number, number];
}

/**
 * Drop-in, self-contained character: WASD + Shift sprint + Space jump with a
 * smooth follow camera. Place inside an R3F `<Canvas>`.
 *
 * ```tsx
 * <Canvas><CharacterController /></Canvas>
 * ```
 */
export function CharacterController({
  config,
  position = [0, 0, 0],
  children,
  followCamera = true,
  cameraOffset,
}: CharacterControllerProps) {
  const ref = useRef<Group>(null);
  useCharacterController(ref, config);

  return (
    <>
      <group ref={ref} position={position}>
        {children ?? <DefaultBody />}
      </group>
      {followCamera && <FollowCamera target={ref} offset={cameraOffset} />}
    </>
  );
}

/** Placeholder capsule body, offset so its feet sit at the group origin. */
function DefaultBody() {
  return (
    <mesh position={[0, 0.8, 0]} castShadow>
      <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
      <meshStandardMaterial color="#6c8cff" roughness={0.4} metalness={0.1} />
    </mesh>
  );
}
