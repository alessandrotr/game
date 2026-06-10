import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier, type RapierRigidBody } from '@react-three/rapier';
import { MathUtils, Vector3, type Group } from 'three';
import { defaultControllerConfig, type CharacterControllerConfig } from './config';
import { useKeyboardControls } from './useKeyboardControls';

/** Per-frame controller state, exposed for animation/UI (read-only). */
export interface PhysicsControllerState {
  /** Current world position of the body (feet). Updated every frame. */
  position: Vector3;
  velocity: Vector3;
  grounded: boolean;
  isMoving: boolean;
  isSprinting: boolean;
}

interface Options {
  /** Kinematic-position RigidBody the controller drives. */
  bodyRef: RefObject<RapierRigidBody | null>;
  /** Visual child rotated to face the movement direction. */
  visualRef: RefObject<Group | null>;
  /** Root-level group synced to the body so the camera can follow it. */
  cameraTargetRef: RefObject<Group | null>;
  overrides?: Partial<CharacterControllerConfig>;
}

/** Interpolate an angle along the shortest path, handling the ±π wrap. */
function lerpAngle(a: number, b: number, t: number): number {
  const tau = Math.PI * 2;
  const diff = ((((b - a) % tau) + tau + Math.PI) % tau) - Math.PI;
  return a + diff * t;
}

/**
 * Physics character controller built on Rapier's kinematic character controller.
 * We compute a desired translation (camera-relative input + self-applied gravity
 * and jump), then let Rapier resolve it against world colliders — giving real
 * collision detection, collide-and-slide, autostep and snap-to-ground — and
 * write the corrected motion back as the body's next kinematic translation.
 */
export function useRapierCharacterController({
  bodyRef,
  visualRef,
  cameraTargetRef,
  overrides,
}: Options): RefObject<PhysicsControllerState> {
  const { world } = useRapier();
  const controls = useKeyboardControls();
  const camera = useThree((s) => s.camera);

  const config = useMemo(() => ({ ...defaultControllerConfig, ...overrides }), [overrides]);

  const verticalVelocity = useRef(0);
  const state = useRef<PhysicsControllerState>({
    position: new Vector3(),
    velocity: new Vector3(),
    grounded: true,
    isMoving: false,
    isSprinting: false,
  });

  // Rapier's character controller (created once, removed on unmount).
  const controllerRef = useRef<ReturnType<typeof world.createCharacterController> | null>(null);
  useEffect(() => {
    const controller = world.createCharacterController(0.01);
    controller.enableAutostep(0.5, 0.2, true); // climb small steps
    controller.enableSnapToGround(0.5); // stick to ground on descents
    controller.setApplyImpulsesToDynamicBodies(true); // push dynamic objects
    controllerRef.current = controller;
    return () => {
      world.removeCharacterController(controller);
      controllerRef.current = null;
    };
  }, [world]);

  const scratch = useMemo(
    () => ({ forward: new Vector3(), right: new Vector3(), move: new Vector3() }),
    [],
  );

  useFrame((_, rawDelta) => {
    const body = bodyRef.current;
    const controller = controllerRef.current;
    if (!body || !controller) return;
    const collider = body.collider(0);
    if (!collider) return;

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

    // --- Gravity + jump (applied manually; kinematic bodies ignore world gravity) ---
    verticalVelocity.current -= config.gravity * dt;
    if (state.current.grounded && c.jump) {
      verticalVelocity.current = config.jumpForce;
      state.current.grounded = false;
      c.jump = false; // consume so one press = one jump
    }
    velocity.y = verticalVelocity.current;

    // --- Let Rapier resolve the desired translation against colliders ---
    controller.computeColliderMovement(collider, {
      x: velocity.x * dt,
      y: velocity.y * dt,
      z: velocity.z * dt,
    });
    const corrected = controller.computedMovement();
    const grounded = controller.computedGrounded();
    state.current.grounded = grounded;
    if (grounded && verticalVelocity.current < 0) verticalVelocity.current = 0;

    const t = body.translation();
    const nextX = t.x + corrected.x;
    const nextY = t.y + corrected.y;
    const nextZ = t.z + corrected.z;
    body.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ });
    state.current.position.set(nextX, nextY, nextZ);

    // --- Face movement direction (rotate the visual, not the collider) ---
    const horizontalSpeedSq = velocity.x * velocity.x + velocity.z * velocity.z;
    if (horizontalSpeedSq > 1e-4 && visualRef.current) {
      const targetYaw = Math.atan2(velocity.x, velocity.z);
      const turn = 1 - Math.exp(-config.rotationLerp * dt);
      visualRef.current.rotation.y = lerpAngle(visualRef.current.rotation.y, targetYaw, turn);
    }

    // --- Sync the camera target to the resolved position ---
    if (cameraTargetRef.current) cameraTargetRef.current.position.set(nextX, nextY, nextZ);

    state.current.isMoving = horizontalSpeedSq > 0.01;
    state.current.isSprinting = sprinting;
  });

  return state;
}
