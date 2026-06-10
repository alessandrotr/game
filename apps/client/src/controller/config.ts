/**
 * Tunable parameters for the character controller. All distances are in world
 * units and all rates are per-second so movement is fully delta-time driven.
 *
 * The field names match the `player` section of the gameplay tuning registry so
 * tuned values can be injected as `overrides` with no mapping layer.
 */
export interface CharacterControllerConfig {
  /** Ground movement speed (units/second). */
  walkSpeed: number;
  /** Movement speed while sprinting (units/second). */
  sprintSpeed: number;
  /** Rate at which horizontal velocity ramps up toward target (1/second). */
  acceleration: number;
  /** Rate at which horizontal velocity ramps down toward target (1/second). */
  deceleration: number;
  /** Upward launch velocity applied on jump (units/second). */
  jumpForce: number;
  /** Downward acceleration (units/second²), as a positive magnitude. */
  gravity: number;
  /** How quickly the body turns to face its movement direction (1/second). */
  rotationLerp: number;
  /** World Y of the ground plane the character's feet rest on. */
  groundY: number;
  /** Upper bound on a frame's delta (seconds) to stay stable after tab refocus. */
  maxDelta: number;
}

export const defaultControllerConfig: CharacterControllerConfig = {
  walkSpeed: 5,
  sprintSpeed: 9,
  acceleration: 12,
  deceleration: 16,
  jumpForce: 8.5,
  gravity: 24,
  rotationLerp: 12,
  groundY: 0,
  maxDelta: 0.1,
};
