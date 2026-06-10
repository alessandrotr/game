import { useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3, type Group } from 'three';
import { defaultControllerConfig, type CharacterControllerConfig } from './config';
import { useKeyboardControls } from './useKeyboardControls';

/** Per-frame controller state, exposed for animation/UI (read-only). */
export interface ControllerState {
  velocity: Vector3;
  grounded: boolean;
  isMoving: boolean;
  isSprinting: boolean;
}

/** Interpolate an angle along the shortest path, handling the ±π wrap. */
function lerpAngle(a: number, b: number, t: number): number {
  const tau = Math.PI * 2;
  const diff = ((((b - a) % tau) + tau + Math.PI) % tau) - Math.PI;
  return a + diff * t;
}

/**
 * Drives a `THREE.Group` as a kinematic character: camera-relative WASD with
 * sprint, gravity + jump, acceleration smoothing, and turn-to-face — all
 * delta-time based. Returns a state ref for animation consumers.
 *
 * Ground collision is a flat plane at `config.groundY`; swap in a physics raycast
 * or a Rapier body here for real terrain without touching anything else.
 */
export function useCharacterController(
  target: RefObject<Group | null>,
  overrides?: Partial<CharacterControllerConfig>,
): RefObject<ControllerState> {
  const controls = useKeyboardControls();
  const camera = useThree((s) => s.camera);

  const config = useMemo(() => ({ ...defaultControllerConfig, ...overrides }), [overrides]);

  const state = useRef<ControllerState>({
    velocity: new Vector3(),
    grounded: true,
    isMoving: false,
    isSprinting: false,
  });

  // Reusable scratch vectors (allocated once, never per frame).
  const scratch = useMemo(
    () => ({ forward: new Vector3(), right: new Vector3(), move: new Vector3() }),
    [],
  );

  useFrame((_, rawDelta) => {
    const group = target.current;
    if (!group) return;

    const dt = Math.min(rawDelta, config.maxDelta);
    const { velocity } = state.current;
    const c = controls.current;

    // --- Camera-relative horizontal basis (projected onto the ground plane) ---
    scratch.forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    scratch.forward.y = 0;
    scratch.forward.normalize();
    scratch.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    scratch.right.y = 0;
    scratch.right.normalize();

    const inputZ = (c.forward ? 1 : 0) - (c.back ? 1 : 0);
    const inputX = (c.right ? 1 : 0) - (c.left ? 1 : 0);

    scratch.move
      .set(0, 0, 0)
      .addScaledVector(scratch.forward, inputZ)
      .addScaledVector(scratch.right, inputX);
    if (scratch.move.lengthSq() > 1) scratch.move.normalize();

    const sprinting = c.sprint && scratch.move.lengthSq() > 0;
    const speed = sprinting ? config.sprintSpeed : config.walkSpeed;

    // --- Horizontal velocity: accelerate when speeding up, decelerate when slowing ---
    const targetVx = scratch.move.x * speed;
    const targetVz = scratch.move.z * speed;
    const targetMagSq = targetVx * targetVx + targetVz * targetVz;
    const currentMagSq = velocity.x * velocity.x + velocity.z * velocity.z;
    const rate = targetMagSq >= currentMagSq ? config.acceleration : config.deceleration;
    const k = 1 - Math.exp(-rate * dt);
    velocity.x = MathUtils.lerp(velocity.x, targetVx, k);
    velocity.z = MathUtils.lerp(velocity.z, targetVz, k);

    // --- Vertical: gravity + jump ---
    velocity.y -= config.gravity * dt;
    if (state.current.grounded && c.jump) {
      velocity.y = config.jumpForce;
      state.current.grounded = false;
      c.jump = false; // consume so one press = one jump
    }

    // --- Integrate position ---
    group.position.x += velocity.x * dt;
    group.position.y += velocity.y * dt;
    group.position.z += velocity.z * dt;

    // --- Flat-ground collision ---
    if (group.position.y <= config.groundY) {
      group.position.y = config.groundY;
      velocity.y = 0;
      state.current.grounded = true;
    }

    // --- Turn to face horizontal movement direction ---
    const horizontalSpeedSq = velocity.x * velocity.x + velocity.z * velocity.z;
    if (horizontalSpeedSq > 1e-4) {
      const targetYaw = Math.atan2(velocity.x, velocity.z);
      const turn = 1 - Math.exp(-config.rotationLerp * dt);
      group.rotation.y = lerpAngle(group.rotation.y, targetYaw, turn);
    }

    // --- Publish state for consumers ---
    state.current.isMoving = horizontalSpeedSq > 0.01;
    state.current.isSprinting = sprinting;
  });

  return state;
}
