import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Euler, Quaternion, type Group, type Object3D } from 'three';
import type { CastAim } from '../../store/castAim';
import { useAimYawSmoother } from './aimSmoothing';

/**
 * Archer weapon gestures (bows + crossbow). Two phases:
 *
 *  1. HOLD (local player only) — while a shot ability is being AIMED (key held),
 *     the bow is drawn and aimed at the cursor with its arrows already nocked
 *     (3 for power_shot, 1 for pinning_arrow / crippling_shot). They leave on
 *     release and simply vanish if the aim is cancelled.
 *  2. FIRE (everyone, driven by the cast EVENT — a bumped `seq` on the aim store):
 *     • shots (power/pinning) — draw + LOOSE down the shot line.
 *     • crippling_shot — pitch UP and loose a volley to the sky (the arrows then
 *       rain down via the `vfx.arrow_volley` burst).
 *     • tumble — tuck the bow back/down for the roll (paired with the dash wind).
 *
 * Groups: `aim` yaws onto the shot/cursor line (countering body yaw so it tracks),
 * `draw` carries the pull-back / recoil / pitch / tuck.
 */

// Scratch for reading the body's live world yaw (no per-frame allocation).
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => Math.sin(Math.min(1, Math.max(0, k)) * (Math.PI / 2));

/** Per-ability fire duration (seconds). */
const DUR: Record<string, number> = {
  power_shot: 0.7, // three 200ms-spaced shots + recovery
  crippling_shot: 0.4,
  pinning_arrow: 0.45,
  tumble: 0.5,
};
/** Nocked-arrow count per ability. */
const COUNT: Record<string, number> = { power_shot: 3, pinning_arrow: 1, crippling_shot: 1 };

/** Local aiming state: which ability is being held and the live aim yaw. */
export interface BowAim {
  ability: string;
  yaw: number;
}

export function useBowAnimator(
  aim: React.RefObject<Group | null>,
  draw: React.RefObject<Group | null>,
  arrows: React.RefObject<Object3D | null>[],
  getCastAim: () => CastAim | null,
  getAim: () => BowAim | null,
  /** True when this bow belongs to the LOCAL player (aim at frame rate, zero
   *  latency). Remote owners' aim is eased to hide the ~10Hz charge stream. */
  getLocalOwner: () => boolean = () => false,
): void {
  const initialized = useRef(false);
  const lastSeq = useRef(0);
  const start = useRef(-Infinity);
  const ability = useRef('');
  const castYaw = useRef(0);
  // Eases a remote owner's hold-aim yaw (local stays frame-rate / zero latency).
  const aimSmoother = useAimYawSmoother();

  const bodyYaw = (n: Group): number => {
    if (!n.parent) return 0;
    n.parent.getWorldQuaternion(_q);
    _e.setFromQuaternion(_q, 'YXZ');
    return _e.y;
  };
  const showArrows = (count: number): void => {
    for (let i = 0; i < arrows.length; i++) {
      const m = arrows[i]?.current;
      if (m) m.visible = i < count;
    }
  };

  useFrame((state, delta) => {
    const aimNode = aim.current;
    const drawNode = draw.current;
    if (!aimNode || !drawNode) return;
    const t = state.clock.elapsedTime;

    const data = getCastAim();
    if (!initialized.current) {
      initialized.current = true;
      lastSeq.current = data?.seq ?? 0;
    } else if (data && data.seq !== lastSeq.current) {
      lastSeq.current = data.seq;
      if (data.ability in DUR) {
        ability.current = data.ability;
        start.current = t;
        castYaw.current = data.yaw;
      }
    }

    const dur = DUR[ability.current] ?? 0.4;
    const e = (t - start.current) / dur;
    const firing = e >= 0 && e < 1;

    if (firing) {
      aimSmoother.reset();
      const ab = ability.current;
      if (ab === 'power_shot') {
        // Three rapid shots (count 3, 200ms apart): one loose RICOCHET per shot,
        // one nocked arrow leaving each time. Starts drawn (from the held aim).
        const el = t - start.current; // seconds
        const GAP = 0.2;
        const RECOIL = 0.15;
        const PULSES = 3;
        const endShots = (PULSES - 1) * GAP + RECOIL;
        let recoilBump = 0;
        let shotsFired = 0;
        for (let i = 0; i < PULSES; i++) {
          const tau = el - i * GAP;
          if (tau >= 0) {
            if (tau < RECOIL) recoilBump = Math.max(recoilBump, Math.sin((tau / RECOIL) * Math.PI) * 0.22);
            if (tau >= 0.05) shotsFired = i + 1;
          }
        }
        let pull = -0.12;
        let aimAmt = 1;
        if (el >= endShots) {
          const k = Math.min(1, (el - endShots) / 0.14);
          pull = lerp(-0.12, 0, k);
          aimAmt = 1 - ease(k);
        }
        aimNode.rotation.y = aimAmt * (castYaw.current - bodyYaw(aimNode));
        drawNode.position.z = pull + recoilBump;
        drawNode.rotation.x = 0;
        showArrows(Math.max(0, 3 - shotsFired));
      } else if (ab === 'pinning_arrow') {
        // Already drawn from the held aim: LOOSE immediately (arrow gone at the
        // shot), a forward recoil kick, then settle.
        const el = t - start.current;
        const kick = el < 0.16 ? Math.sin((el / 0.16) * Math.PI) * 0.2 : 0;
        const tail = Math.max(0, 1 - el / 0.4);
        aimNode.rotation.y = tail * (castYaw.current - bodyYaw(aimNode));
        drawNode.position.z = -0.12 * tail + kick;
        drawNode.rotation.x = 0;
        showArrows(0); // loosed the instant the shot fires
      } else if (ab === 'crippling_shot') {
        // Volley: face the target, pitch UP to the sky, draw and loose.
        const loose = 0.5;
        let aimAmt: number;
        let pitch: number;
        let pull: number;
        let arrowOn: boolean;
        if (e < loose) {
          const k = e / loose;
          aimAmt = Math.min(1, k * 2.5);
          pitch = -0.95 * ease(k);
          pull = -0.12 * ease(k);
          arrowOn = true;
        } else if (e < loose + 0.1) {
          const k = (e - loose) / 0.1;
          aimAmt = 1;
          pitch = -0.95;
          pull = lerp(-0.12, 0.05, k);
          arrowOn = k < 0.25;
        } else {
          const k = (e - loose - 0.1) / (1 - loose - 0.1);
          aimAmt = 1 - ease(k);
          pitch = -0.95 * (1 - ease(k));
          pull = lerp(0.05, 0, ease(k));
          arrowOn = false;
        }
        aimNode.rotation.y = aimAmt * (castYaw.current - bodyYaw(aimNode));
        drawNode.rotation.x = pitch;
        drawNode.position.z = pull;
        showArrows(arrowOn ? COUNT[ab] ?? 1 : 0);
      } else {
        // Tumble: tuck the bow back and down for the roll.
        const a = e < 0.25 ? ease(e / 0.25) : e < 0.7 ? 1 : Math.cos(((e - 0.7) / 0.3) * (Math.PI / 2));
        aimNode.rotation.y = 0;
        drawNode.rotation.x = a * 0.9;
        drawNode.position.z = a * -0.12;
        showArrows(1); // a nocked arrow stays on the bow through the roll
      }
      return;
    }

    // Not firing — show the nocked draw while a shot is AIMED (local or remote).
    const held = getAim();
    if (held && held.ability in COUNT) {
      const targetYaw = held.yaw - bodyYaw(aimNode);
      aimNode.rotation.y = aimSmoother.smooth(targetYaw, getLocalOwner(), delta);
      if (held.ability === 'crippling_shot') {
        drawNode.rotation.x = -0.95; // pitched to the sky
        drawNode.position.z = -0.12;
      } else {
        drawNode.rotation.x = 0;
        drawNode.position.z = -0.14; // held at full draw
      }
      showArrows(COUNT[held.ability] ?? 1);
      return;
    }

    // Rest.
    aimSmoother.reset();
    aimNode.rotation.y = 0;
    drawNode.position.z = 0;
    drawNode.rotation.x = 0;
    showArrows(0);
  });
}
