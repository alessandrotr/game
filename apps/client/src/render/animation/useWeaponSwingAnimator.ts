import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Euler, Quaternion, type Group, type Vector3Tuple } from 'three';
import type { CastAim } from '../../store/castAim';

// Scratch for reading the body's live world yaw (no per-frame allocation).
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');

/**
 * Melee weapon gestures (warrior). The weapon stays in the hand; an OUTER group
 * yaws + lifts (sweep), a MIDDLE group pitches + scales (lay), and an INNER group
 * holds the resting grip tilt — which is FADED OUT during a gesture so the blade
 * points cleanly (e.g. straight back on a charge) instead of inheriting the hand
 * roll. Each ability drives a different gesture:
 *   • cleave      — lay flat, sweep a 180° frontal arc, grow for impact.
 *   • ground_slam — same, but a full 360° spin.
 *   • charge      — throw the blade straight back, hold for the dash, return.
 *   • shield_wall — lift the sword up, then back down.
 * Driven by the cast EVENT (a bumped `seq` on the aim store).
 */

/** Per-ability gesture duration (seconds). cleave matches its 280ms VFX. */
const GESTURE_DUR: Record<string, number> = {
  cleave: 0.28,
  ground_slam: 0.48,
  charge: 0.5,
  shield_wall: 0.5,
};

const SWEEP = Math.PI / 2 + 0.2; // half the cleave arc (~180°)
const LAY = 1.5; // lay the blade flat for a sweep
const GROW = 2.0; // grow for impact during a sweep

const easeInOut = (k: number): number => Math.sin(Math.min(1, Math.max(0, k)) * (Math.PI / 2));
/** Trapezoid 0→1→0: rise over [0,up], hold to `dn`, fall to 1. */
function trap(e: number, up: number, dn: number): number {
  if (e < up) return easeInOut(e / up);
  if (e < dn) return 1;
  return Math.cos(((e - dn) / (1 - dn)) * (Math.PI / 2));
}

interface Pose {
  pitch: number; // lay.rotation.x
  yaw: number; // sweep.rotation.y
  lift: number; // sweep.position.y
  scale: number; // lay scale
  fade: number; // 0 keep grip tilt → 1 fade it out (clean gesture orientation)
}
const REST: Pose = { pitch: 0, yaw: 0, lift: 0, scale: 1, fade: 0 };

/** A laid-flat blade sweeping `half` radians each side, growing for impact. */
function sweepPose(e: number, half: number): Pose {
  const a = trap(e, 0.18, 0.84);
  return { pitch: a * LAY, yaw: a * (-half + e * 2 * half), lift: 0, scale: 1 + (GROW - 1) * a, fade: a };
}

/** A full 360° spin: lay flat fast, sweep the WHOLE circle, lift out. The yaw is
 *  NOT scaled by the lay (unlike `sweepPose`) so the arc is a true 360°. */
function spinPose(e: number): Pose {
  const a = trap(e, 0.12, 0.88);
  return { pitch: a * LAY, yaw: -Math.PI + e * 2 * Math.PI, lift: 0, scale: 1 + (GROW - 1) * a, fade: a };
}

function poseFor(ability: string, e: number): Pose {
  switch (ability) {
    case 'cleave':
      return sweepPose(e, SWEEP); // ~180° (unchanged)
    case 'ground_slam':
      return spinPose(e); // full 360°
    case 'charge': {
      // Blade thrown straight back (opposite the dash) and held, then returned.
      const a = trap(e, 0.22, 0.72);
      return { pitch: a * -1.5, yaw: 0, lift: 0, scale: 1, fade: a };
    }
    case 'shield_wall': {
      // Raise the sword up (and tilt overhead), then lower it.
      const a = trap(e, 0.35, 0.6);
      return { pitch: a * -0.5, yaw: 0, lift: a * 0.4, scale: 1, fade: a };
    }
    default:
      return REST;
  }
}

export function useWeaponSwingAnimator(
  sweep: React.RefObject<Group | null>,
  lay: React.RefObject<Group | null>,
  grip: React.RefObject<Group | null>,
  getCastAim: () => CastAim | null,
  gripRot: Vector3Tuple,
): void {
  const initialized = useRef(false);
  const lastSeq = useRef(0);
  const start = useRef(-Infinity);
  const ability = useRef('');
  // World yaw of the cast direction — the frame the (oriented) VFX sweeps in. The
  // sword is locked to it so the swing stays glued to the VFX regardless of how
  // the body turns while moving.
  const castYaw = useRef(0);

  /** The body's live world yaw (the weapon mount's parent, which only translates). */
  const bodyYaw = (node: Group): number => {
    if (!node.parent) return 0;
    node.parent.getWorldQuaternion(_q);
    _e.setFromQuaternion(_q, 'YXZ');
    return _e.y;
  };

  useFrame((state) => {
    const sweepNode = sweep.current;
    const layNode = lay.current;
    const gripNode = grip.current;
    if (!sweepNode || !layNode || !gripNode) return;
    const t = state.clock.elapsedTime;

    const data = getCastAim();
    // Baseline on the FIRST frame (even with no cast yet) so the first cast fires
    // instead of being swallowed as the baseline.
    if (!initialized.current) {
      initialized.current = true;
      lastSeq.current = data?.seq ?? 0;
    } else if (data && data.seq !== lastSeq.current) {
      lastSeq.current = data.seq;
      if (data.ability in GESTURE_DUR) {
        ability.current = data.ability;
        start.current = t;
        castYaw.current = data.yaw;
      }
    }

    const dur = GESTURE_DUR[ability.current] ?? 0.3;
    const e = (t - start.current) / dur;
    const p = e < 0 || e >= 1 ? REST : poseFor(ability.current, e);

    layNode.rotation.x = p.pitch;
    layNode.scale.setScalar(p.scale);
    sweepNode.position.y = p.lift;
    // Lock the sweep to the cast-direction frame (where the VFX sweeps): world
    // yaw = castYaw + p.yaw, achieved by subtracting the body's live yaw. So the
    // sword stays glued to the VFX even as the body turns while moving.
    sweepNode.rotation.y = p.fade > 0 ? castYaw.current + p.yaw - bodyYaw(sweepNode) : p.yaw;
    // Fade the resting grip tilt out during the gesture for a clean orientation.
    const keep = 1 - p.fade;
    gripNode.rotation.set(gripRot[0] * keep, gripRot[1] * keep, gripRot[2] * keep);
  });
}
