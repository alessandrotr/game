import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Euler, Quaternion, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import type { CastAim } from '../../store/castAim';

// Scratch objects reused across frames (no per-frame allocation).
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');

/** Wrap to [-π, π] so the weapon swings the short way around. */
function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Live state of an in-progress channel for the weapon's owner, or null when the
 *  owner isn't channelling. `yaw` is the beam's current world heading (the live
 *  cursor locally, the replicated direction for remotes) so the scepter re-aims
 *  with the beam. */
export interface ChannelState {
  yaw: number;
}

/**
 * Caster weapon flourish (priest / mage scepters). On each cast the weapon swings
 * to point down the ability line, lunges, and its orb flares with light — whether
 * the caster is standing or running, since it's driven by the cast EVENT (a
 * bumped `seq` on the aim store) rather than the FSM animation state (which the
 * engine interrupts with movement).
 *
 * Two gesture shapes, both cheap:
 *  - Instant cast (holdMs 0): a quick thrust-and-return along the shot line.
 *  - Channel (holdMs > 0, e.g. the priest beam): hold the scepter raised for as
 *    long as the caster is actually channelling — retracting the instant the
 *    channel ends or is interrupted — and re-aim it live with the beam.
 *
 * Cost discipline: once a gesture settles it deactivates and the callback
 * early-returns, so idle frames and non-channel casts never touch the channel
 * lookups; `getChannel` runs only during an active channel gesture.
 */

/** Seconds to raise the weapon to full extension. */
const ATTACK = 0.14;
/** Seconds to retract back to rest once the ability is over. */
const RELEASE = 0.28;
/** Grace window (s) after a channel starts during which the pose is held even
 *  before the replicated channel state confirms — the local cast is predicted, so
 *  `channelAbility` arrives ~1 round-trip later. */
const CHANNEL_GRACE = 0.5;
/** Peak forward tip of the weapon head, in radians (~35°). */
const THRUST_ANGLE = 0.62;
/** Peak forward lunge along the shot line, in local units. */
const THRUST_LUNGE = 0.07;
/** Peak additive opacity of the orb flare. */
const FLARE_OPACITY = 0.95;

/** Instant thrust envelope (0 rest → 1 → 0): ease up over ATTACK, ease back over
 *  RELEASE. Returns 0 once finished. */
function thrust(elapsed: number): number {
  if (elapsed <= 0) return 0;
  if (elapsed < ATTACK) return Math.sin((elapsed / ATTACK) * (Math.PI / 2));
  const r = (elapsed - ATTACK) / RELEASE;
  return r >= 1 ? 0 : Math.cos(r * (Math.PI / 2));
}

export function useWeaponCastAnimator(
  aim: React.RefObject<Group | null>,
  tip: React.RefObject<Group | null>,
  flare: React.RefObject<Mesh | null>,
  getCastAim: () => CastAim | null,
  getChannel: () => ChannelState | null,
): void {
  // Baselined on the first frame so a cast that already happened before mount
  // (e.g. a remount mid-game) doesn't replay; every later bump fires a swing.
  const initialized = useRef(false);
  const lastSeq = useRef(0);
  const castStart = useRef(0);
  const castYaw = useRef(0);
  const holdSec = useRef(0);
  // Whether a gesture is in progress (gates all per-frame work to avoid touching
  // the channel lookups while idle).
  const gesture = useRef(false);
  // For channels: clock time the release ramp began (-1 while still holding).
  const releaseStart = useRef(-1);

  useFrame((state) => {
    const aimNode = aim.current;
    const tipNode = tip.current;
    if (!aimNode || !tipNode) return;
    const t = state.clock.elapsedTime;

    const data = getCastAim();
    if (!initialized.current) {
      // Sync to whatever's already recorded (0 if none) WITHOUT firing.
      initialized.current = true;
      lastSeq.current = data?.seq ?? 0;
    } else if (data && data.seq !== lastSeq.current) {
      lastSeq.current = data.seq;
      castStart.current = t;
      castYaw.current = data.yaw;
      holdSec.current = data.holdMs / 1000;
      gesture.current = true;
      releaseStart.current = -1;
    }

    if (!gesture.current) return; // settled at rest — nothing to do

    const elapsed = t - castStart.current;
    let p: number;
    let targetYaw = castYaw.current;

    if (holdSec.current > 0) {
      // Channel: hold while the caster is channelling, re-aiming with the beam.
      const ch = getChannel();
      if (ch) targetYaw = ch.yaw; // live re-aim (matches the beam's heading)
      // Active while the (predicted) start grace holds, or the channel is live;
      // capped at the ability's max duration as a safety net.
      const live = elapsed < ATTACK + CHANNEL_GRACE || ch !== null;
      const capped = elapsed > ATTACK + holdSec.current;
      if (live && !capped) {
        p = elapsed < ATTACK ? Math.sin((elapsed / ATTACK) * (Math.PI / 2)) : 1;
        releaseStart.current = -1;
      } else {
        if (releaseStart.current < 0) releaseStart.current = t;
        const r = (t - releaseStart.current) / RELEASE;
        p = r >= 1 ? 0 : Math.cos(r * (Math.PI / 2));
      }
    } else {
      p = thrust(elapsed);
    }

    // Yaw the weapon onto the shot line: the body faces its movement direction,
    // so derive its live world yaw and aim relative to it.
    let aimYaw = 0;
    if (p > 0 && aimNode.parent) {
      aimNode.parent.getWorldQuaternion(_q);
      _e.setFromQuaternion(_q, 'YXZ');
      aimYaw = wrap(targetYaw - _e.y);
    }

    // Swing toward the shot line (yaw), then tip the head forward and lunge.
    aimNode.rotation.y = p * aimYaw;
    tipNode.rotation.x = p * THRUST_ANGLE;
    tipNode.position.z = p * THRUST_LUNGE;

    const f = flare.current;
    if (f) {
      const on = p > 0.001;
      f.visible = on;
      if (on) {
        f.scale.setScalar(0.7 + p * 0.8);
        (f.material as MeshBasicMaterial).opacity = p * FLARE_OPACITY;
      }
    }

    // Gesture finished (fully retracted past the initial ramp) — settle and stop
    // working until the next cast.
    if (p <= 0 && elapsed > ATTACK) gesture.current = false;
  });
}
