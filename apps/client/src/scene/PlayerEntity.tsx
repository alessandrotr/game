import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html, Text } from '@react-three/drei';
import {
  CanvasTexture,
  MathUtils,
  Vector3,
  type Group,
  type Mesh,
  PlaneGeometry,
  RingGeometry,
  MeshBasicMaterial,
} from 'three';
import {
  ARENA_HALF_SIZE,
  ARENA_HALF_Z,
  ZOMBIE_ROOM_HALF_SIZE,
  AUTO_ATTACKS,
  PICKABLE_CARRY_Y,
  TOWN_HALF_SIZE,
  TOWN_OBSTACLES,
  PLAYER_RADIUS,
  clampToUnlockedArea,
  collideObstacles,
  getCosmeticOfType,
  gunMoveSpeedMult,
  isRooted,
  isStunned,
  isZombieSkin,
  stepLocomotion,
  type AnimationName,
  type ArenaObstacle,
  type CharacterClass,
} from '@arena/shared';
import { useArenaLayout } from './useArenaLayout';
import { TEAM_COLORS } from '../lib/teamColors';
import { useGameStore } from '../store/useGameStore';
import { useCombatFlagsStore } from '../store/useCombatFlagsStore';
import { clearLocalRenderTransform, setLocalRenderTransform } from '../store/localPlayer';
import { getFpsAim, isFpsEngaged } from '../store/fpsAim';
import { getCursorGround } from '../store/cursorState';
import { clearDestination, getDestination } from '../store/destinationState';
import { clearLocalDash, getLocalDash } from '../store/dashState';
import { useTargetStore } from '../store/targetState';
import { usePaperdollStore } from '../store/usePaperdollStore';
import { useSpeechStore } from '../store/useSpeechStore';
import { sendAttack } from '../network/colyseus';
import { sampleTransform, INTERP_DELAY_MS } from '../store/snapshotBuffer';
import { getLocalMovement } from '../tuning';
import { resolveCharacter, resolveEnchant } from '../assets/CharacterFactory';
import { zombieBody } from '../assets/data/zombies';
import { usePaintStore } from '../store/usePaintStore';
import { paintTexturesFor, applyClassPaint } from '../paint/paintSurface';
import { fetchPublicPaint } from '../network/paint';
import { CharacterModel } from '../render/CharacterModel';
import { createCharacterFSM } from '../render/animation/animationStateMachine';
import { clearAnimationEvents, consumeAnimationEvent } from '../render/animation/animationEvents';
import { clearCastAim } from '../store/castAim';
import { clearWeaponTip } from '../store/weaponTip';
import { PickableVisual } from './PickableVisual';

// Cache of pre-rendered canvases to draw text as textures for zombies without CPU/Troika cost
const zombieTextTextures = new Map<string, CanvasTexture>();

function getZombieTextTexture(text: string): CanvasTexture {
  let tex = zombieTextTextures.get(text);
  if (!tex) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);

    ctx.font = '300 42px Arial'; // Arial Light font weight, slightly larger on canvas
    ctx.fillStyle = '#e6e9f5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3; // Thinner stroke outline to match the light font cleanly
    ctx.strokeText(text, 128, 32);
    ctx.fillText(text, 128, 32);

    tex = new CanvasTexture(canvas);
    zombieTextTextures.set(text, tex);
  }
  return tex;
}

/** Smoothing for the local player's vertical (jump) toward the server's. */
const REMOTE_SMOOTHING = 14;
/** While idle, how fast the predicted position settles onto the server's. With
 *  the shared deterministic step they're already aligned, so this just absorbs
 *  any sub-unit residual seamlessly. */
const SETTLE_RATE = 10;
/**
 * After arriving at a destination, briefly hold the (deterministic) stop point
 * and let the authoritative server — a few frames behind — converge onto it,
 * rather than settling backward toward its still-in-transit position. That
 * backward settle was the small "bounce-back" felt on arrival.
 */
const ARRIVE_HOLD_MS = 350;
/**
 * Divergence (world units) that counts as a true reposition (respawn/knockback/
 * blink) and hard-snaps the local player. Above the lag-induced lead: the client
 * legitimately runs ~one round-trip ahead while moving (≈ speed × RTT), and the
 * shared step keeps it from drifting otherwise.
 */
const TELEPORT_SNAP = 6;
/** Per-frame horizontal step larger than this is a teleport (blink/respawn),
 *  not locomotion — don't let it flash the run animation. */
const TELEPORT_STEP = 2;
const HP_BAR_WIDTH = 1;
/** Health per segment tick on the floating bar (LoL-style chunks). */
const HP_PER_CHUNK = 100;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Shared global geometries to avoid dynamic allocations per entity/frame
const sharedHpBarBgGeom = new PlaneGeometry(HP_BAR_WIDTH, 0.12);
const sharedHpBarFillGeom = new PlaneGeometry(HP_BAR_WIDTH, 0.1);
const sharedZombieNameGeom = new PlaneGeometry(1.8, 0.45);
const sharedTickGeom = new PlaneGeometry(0.02, 0.12);

const sharedTeamHaloGeom = new RingGeometry(0.82, 0.98, 40);
const sharedLocalPlayerGeom = new RingGeometry(0.55, 0.7, 32);
const sharedTargetGeom = new RingGeometry(0.6, 0.78, 32);

// Shared global materials to avoid dynamic compilation / overhead
const sharedHpBarBgMaterial = new MeshBasicMaterial({ color: '#1a1f2e' });
const sharedHpBarFillMaterial = new MeshBasicMaterial({ color: '#4ade80' });
const sharedShieldFillMaterial = new MeshBasicMaterial({ color: '#aab4ff' });
const sharedTickMaterial = new MeshBasicMaterial({ color: '#0b0e16' });

const sharedTeamHaloMaterialRed = new MeshBasicMaterial({
  color: TEAM_COLORS.red,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
});
const sharedTeamHaloMaterialBlue = new MeshBasicMaterial({
  color: TEAM_COLORS.blue,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
});

const sharedLocalPlayerMaterial = new MeshBasicMaterial({
  color: '#ffffff',
  transparent: true,
  opacity: 0.85,
});

const sharedTargetMaterial = new MeshBasicMaterial({
  color: '#ff5a5a',
  transparent: true,
  opacity: 0.9,
});

// Cache of materials for zombie name text billboards
const zombieNameMaterials = new Map<string, MeshBasicMaterial>();
function getZombieNameMaterial(text: string): MeshBasicMaterial {
  let mat = zombieNameMaterials.get(text);
  if (!mat) {
    mat = new MeshBasicMaterial({
      map: getZombieTextTexture(text),
      transparent: true,
      depthWrite: false,
    });
    zombieNameMaterials.set(text, mat);
  }
  return mat;
}

interface PlayerEntityProps {
  sessionId: string;
}

/**
 * Renders one player from their replicated class/skin via the asset registry.
 *
 * The **local** player is client-side predicted for point-and-click movement
 * (matching the server's walk/sprint speeds and obstacle collision) and
 * reconciled against the authoritative snapshot. Vertical position (jumps) comes
 * from the server for everyone, interpolated. A per-entity animation state
 * machine derives the pose each frame from rendered speed, alive flag, and
 * one-shot events (cast/attack/hit) pushed by the network layer; the death pose
 * plays in place until respawn.
 */
export function PlayerEntity({ sessionId }: PlayerEntityProps) {
  const group = useRef<Group>(null);
  // Only the body turns to face movement; the node itself never rotates, so the
  // billboarded nameplate / HP bar (and the ground rings) sit perfectly still
  // over the player instead of swinging a frame behind the body's turn.
  const body = useRef<Group>(null);
  const hpFill = useRef<Mesh>(null);
  const shieldFill = useRef<Mesh>(null);
  // The floating health bar (background + fill); hidden while dead.
  const hpBar = useRef<Group>(null);

  // Class/skin/name are assigned at join and don't change — read once at mount.
  const player = useGameStore.getState().players.get(sessionId);
  const isLocal = useGameStore.getState().sessionId === sessionId;
  const isTargeted = useTargetStore((s) => s.targetId === sessionId);
  // Team halo only reads as meaningful in the arena (town is teamless/FFA).
  const inArena = useGameStore((s) => s.room === 'arena');
  // First-person gun mode hides the local player's own body (the camera is inside
  // its head); the top-down view and everyone else still render normally.
  const gunMode = useGameStore((s) => s.gunMode);
  const gunView = useGameStore((s) => s.gunView);
  const hideOwnBody = isLocal && gunMode && gunView === 'fps';
  // Equipped title can change live (equip broadcast), so read it reactively —
  // the selector only re-renders this entity when the title id actually changes.
  const titleId = useGameStore((s) => s.players.get(sessionId)?.titleId ?? '');
  const title = titleId ? getCosmeticOfType(titleId, 'title') : undefined;
  // Max HP is constant per class, so this selector only re-renders on a class
  // change — it drives how many segment ticks the floating bar is divided into.
  const maxHp = useGameStore((s) => s.players.get(sessionId)?.maxHp ?? 0);
  const chunkCount = Math.max(1, Math.round(maxHp / HP_PER_CHUNK));
  const bubble = useSpeechStore((s) => s.bubbles[sessionId]);
  const skinId = useGameStore((s) => s.players.get(sessionId)?.skinId ?? '');
  const isMiniBoss = skinId === 'skin.zombie.miniboss';
  const scaleMult = isMiniBoss ? 2.5 : 1;
  const billboardY = 2.7 * scaleMult;
  const bubbleY = 3.4 * scaleMult;

  // Selective store listener: only trigger a re-render when the rage threshold is crossed,
  // preventing constant re-renders/useMemo updates on every HP fluctuation.
  const isRaged = useGameStore((s) => {
    const p = s.players.get(sessionId);
    if (!p) return false;
    return p.skinId === 'skin.zombie.miniboss' && p.hp < p.maxHp * 0.5;
  });

  const descriptor = useMemo(() => {
    const desc = resolveCharacter(
      player?.characterClass ?? 'warrior',
      player?.skinId,
      player?.dyeId,
      player?.weaponId,
    );
    // Mini-boss berserk cue (<50% HP): the primitive body has its own red rage
    // palette (placeholder bodies don't honor `tint`, unlike the old GLB).
    if (isRaged && desc.render.kind === 'placeholder') {
      return { ...desc, render: { ...desc.render, parts: zombieBody('miniboss', { raged: true }) } };
    }
    return desc;
  }, [player?.characterClass, player?.skinId, player?.dyeId, player?.weaponId, isRaged]);

  const enchant = useMemo(() => resolveEnchant(player?.enchantId), [player?.enchantId]);

  // Custom paint. The LOCAL player edits + sees their own paint live (the texture
  // object is stable, so brush strokes update it without a remount). REMOTE players
  // are fetched over HTTP by account id whenever their replicated paint revision
  // changes, and applied to per-session surfaces.
  const characterClass = (player?.characterClass ?? 'warrior') as CharacterClass;
  useEffect(() => {
    if (isLocal) void usePaintStore.getState().hydrate(characterClass);
  }, [isLocal, characterClass]);
  const localPainted = usePaintStore((s) => isLocal && !!s.customizedByClass[characterClass]);

  // Remote: fetch + apply the peer's paint whenever they have an account (pid>0).
  // `paintRev` is only a REFETCH trigger for live edits — NOT a precondition, since
  // it's often empty at join time (paint loads async / was painted a prior session).
  const pid = useGameStore((s) => s.players.get(sessionId)?.pid ?? 0);
  const paintRev = useGameStore((s) => s.players.get(sessionId)?.paintRev ?? '');
  const [remoteReady, setRemoteReady] = useState(false);
  useEffect(() => {
    if (isLocal || !pid) {
      setRemoteReady(false);
      return;
    }
    let cancelled = false;
    void fetchPublicPaint(pid)
      .then(async (state) => {
        const cls = state[characterClass];
        const has = !!cls && Object.keys(cls).length > 0;
        if (has) await applyClassPaint(sessionId, cls);
        if (!cancelled) setRemoteReady(has);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLocal, pid, paintRev, characterClass, sessionId]);

  const paint = isLocal
    ? localPainted
      ? paintTexturesFor(characterClass)
      : undefined
    : remoteReady
      ? paintTexturesFor(sessionId)
      : undefined;

  // Predicted local-player state (lazily initialized from the first snapshot).
  const predicted = useRef<Vector3 | null>(null);
  const predictedRot = useRef(player?.rotation ?? 0);
  // Timestamp (ms) of the last destination arrival, for the post-arrival hold.
  const arrivedAt = useRef(0);

  // Animation: a state machine fed each frame, exposed to the model via a stable
  // getter so the character animates without per-frame React re-renders.
  const fsm = useRef(createCharacterFSM());
  const animName = useRef<AnimationName>('idle');
  const getAnimation = useRef(() => animName.current).current;
  const prevPos = useRef({ x: player?.x ?? 0, z: player?.z ?? 0 });
  // Rendered ground speed, exposed via a stable getter so the GLTF animator can
  // match the run clip's playback to it (no foot-sliding).
  const speedRef = useRef(0);
  const getSpeed = useRef(() => speedRef.current).current;

  // Pools to avoid array/object allocation on every frame in zombie mode
  const blockersPoolRef = useRef<ArenaObstacle[]>([]);
  const arenaMoveObstaclesRef = useRef<ArenaObstacle[]>([]);
  const billboardRef = useRef<Group>(null);

  useEffect(() => {
    // Drop any pending one-shot animation event for this session on unmount
    // (e.g. the player left), and clear the local render transform.
    return () => {
      clearAnimationEvents(sessionId);
      clearCastAim(sessionId);
      clearWeaponTip(sessionId);
      if (isLocal) clearLocalRenderTransform();
    };
  }, [isLocal, sessionId]);

  // This match's cover — the predictor collides against the same obstacles the
  // server generated, so prediction matches authority by construction. Static
  // cover comes from the layout; alive (un-crumbled) HP structures are merged in
  // from replicated state and drop out the instant one is destroyed.
  const layoutObstacles = useArenaLayout().obstacles;
  const structureObstacles = useGameStore((s) => s.structureObstacles);
  const arenaObstacles = useMemo(
    () => [...layoutObstacles, ...structureObstacles],
    [layoutObstacles, structureObstacles],
  );

  useFrame((_, delta) => {
    const node = group.current;
    const latest = useGameStore.getState().players.get(sessionId);
    if (!node || !latest) return;

    // HP bar visibility: Hide dead entities. Pre-rendered text billboards are shown all the time when alive.
    if (billboardRef.current) {
      billboardRef.current.visible = latest.alive;
    }

    if (!latest.alive) {
      // A dead target is no longer attackable — drop the local highlight.
      if (useTargetStore.getState().targetId === sessionId) {
        useTargetStore.getState().setTarget(null);
      }
      // Hold position and play the death pose in place (no movement while down).
      if (isLocal) {
        clearDestination();
        animName.current = fsm.current.step({ speed: 0, alive: false, event: null }, delta * 1000);
      } else {
        animName.current = latest.animState; // authoritative ('die')
      }
      prevPos.current.x = node.position.x;
      prevPos.current.z = node.position.z;
      return;
    }

    if (isLocal) {
      // Vertical (jump/fall) stays server-authoritative, smoothed.
      node.position.y = MathUtils.lerp(node.position.y, latest.y, 1 - Math.exp(-REMOTE_SMOOTHING * delta));

      if (!predicted.current) {
        predicted.current = new Vector3(latest.x, 0, latest.z);
        predictedRot.current = latest.rotation;
      }
      const pos = predicted.current;
      const prevX = pos.x;
      const prevZ = pos.z;
      const mv = getLocalMovement(latest.characterClass as CharacterClass);
      const isArena = useGameStore.getState().room === 'arena';
      const isZombieRoom = isArena && useGameStore.getState().zombieMode;
      const halfBounds = (isArena ? (isZombieRoom ? ZOMBIE_ROOM_HALF_SIZE : ARENA_HALF_SIZE) : TOWN_HALF_SIZE) - PLAYER_RADIUS;
      // FFA arena is a rectangle (longer N/S); zombie + town stay square. Must
      // match the server's per-axis clamp (ArenaRoom arenaLimitZ) for lockstep.
      const halfBoundsZ = isArena && !isZombieRoom ? ARENA_HALF_Z - PLAYER_RADIUS : halfBounds;
      const dest = getDestination();

      // Zombie mode (arena): the living horde is solid. Collide against the same
      // zombie bodies the server does (matched by skin), rebuilt each frame since
      // they move, so the player is blocked by the horde instead of walking
      // through. `height: 0` keeps them ArenaObstacle-shaped for collideObstacles.
      let arenaMoveObstacles: readonly ArenaObstacle[] = arenaObstacles;
      if (isArena && useGameStore.getState().zombieMode) {
        const combined = arenaMoveObstaclesRef.current;
        combined.length = 0;
        for (let idx = 0; idx < arenaObstacles.length; idx++) {
          combined.push(arenaObstacles[idx]!);
        }
        let poolIdx = 0;
        const pool = blockersPoolRef.current;
        useGameStore.getState().players.forEach((p, id) => {
          if (id !== sessionId && p.alive && isZombieSkin(p.skinId)) {
            let b = pool[poolIdx];
            if (!b) {
              b = { x: 0, z: 0, radius: PLAYER_RADIUS, height: 0 };
              pool[poolIdx] = b;
            }
            b.x = p.x;
            b.z = p.z;
            combined.push(b);
            poolIdx++;
          }
        });
        arenaMoveObstacles = combined;
      }
      // Hard CC mirrors the server: stun/root halt movement; a stun also drops
      // the chase target. Read through the shared status helpers (a present
      // status is live — the server prunes expired ones each tick).
      const rooted = isRooted(latest);
      const stunned = isStunned(latest);

      // Auto-attack chase intent (arena only). Drop it the moment the target dies
      // so we stop chasing a corpse (the server clears its attack-target too).
      const attackId = isArena ? useTargetStore.getState().targetId : null;
      const target = attackId ? useGameStore.getState().players.get(attackId) : undefined;
      if (target && !target.alive) {
        useTargetStore.getState().setTarget(null);
      }
      const attacking = !rooted && !!target && target.alive;

      // Predicted dash (charge / tumble): a constant-velocity slide that mirrors
      // the server's displacement and overrides locomotion while active — so the
      // dash is smooth even mid-run instead of snapping.
      const dashState = getLocalDash();
      const dashing = dashState.active && performance.now() < dashState.until;

      if (dashing) {
        pos.x = clamp(pos.x + dashState.vx * delta, -halfBounds, halfBounds);
        pos.z = clamp(pos.z + dashState.vz * delta, -halfBoundsZ, halfBoundsZ);
        // Dashes only happen in the arena (abilities are arena-only), so collide
        // against the match's cover and active move blockers (zombies).
        const fixed = collideObstacles(pos.x, pos.z, arenaMoveObstacles, PLAYER_RADIUS);
        pos.x = fixed.x;
        pos.z = fixed.z;
        predictedRot.current = Math.atan2(dashState.dirX, dashState.dirZ);
      } else if (rooted) {
        // Hard CC: the server halts the player and drops the move order (stun or
        // root); a stun also drops the chase target (see ArenaRoom). Mirror it so
        // the predictor stops walking toward the now-cancelled destination
        // instead of running ahead and snapping back — the "elastic" lag. The
        // body settles onto the frozen server position via the reconcile below.
        if (dest.active) clearDestination();
        if (stunned && attackId) useTargetStore.getState().setTarget(null);
      } else if (attacking && target) {
        // Mirror the server's auto-attack movement so prediction matches by
        // construction: face the target, close to attack range, then HOLD and
        // strike in place (no rubber-banding, stops dead like LoL).
        const cfg = AUTO_ATTACKS[latest.characterClass as CharacterClass];
        const dx = target.x - pos.x;
        const dz = target.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-3) predictedRot.current = Math.atan2(dx / dist, dz / dist);
        if (dist > cfg.range) {
          const step = Math.min(mv.speed * delta, dist - cfg.range + 0.01);
          pos.x = clamp(pos.x + (dx / dist) * step, -halfBounds, halfBounds);
          pos.z = clamp(pos.z + (dz / dist) * step, -halfBoundsZ, halfBoundsZ);
          // Same post-move obstacle push-out the server applies to the chase path.
          const fixed = collideObstacles(pos.x, pos.z, arenaMoveObstacles, PLAYER_RADIUS);
          pos.x = fixed.x;
          pos.z = fixed.z;
        }
      } else {
        // The SAME deterministic step the server runs → prediction matches by
        // construction (single speed, slides around obstacles, clamps to bounds).
        const result = stepLocomotion(
          { x: pos.x, z: pos.z, rotation: predictedRot.current },
          dest.active ? { x: dest.x, z: dest.z } : null,
          {
            // Gun mode walks slower per view (matches the server's gun-mode speed
            // so prediction stays in lockstep) — first person is calmer than top-down.
            speed: gunMode ? mv.speed * gunMoveSpeedMult(gunView) : (isArena ? mv.speed - 1 : mv.speed),
            rotationSpeed: mv.rotationSpeed,
            stoppingDistance: mv.stoppingDistance,
            halfBounds,
            halfBoundsZ,
            obstacles: isArena ? arenaMoveObstacles : TOWN_OBSTACLES,
          },
          delta,
        );
        pos.x = result.x;
        pos.z = result.z;
        predictedRot.current = result.rotation;
        if (result.arrived) {
          clearDestination();
          arrivedAt.current = performance.now();
        }
      }
      if (dashState.active && !dashing) clearLocalDash();

      // Room expansion system: enforce section boundaries on the client prediction
      // so the player can't walk through walls into locked sections.
      if (isZombieRoom) {
        const store = useGameStore.getState();
        const layout = window.__arenaRoomLayout;
        if (layout) {
          const clamped = clampToUnlockedArea(
            pos.x,
            pos.z,
            layout,
            store.unlockedSections,
            PLAYER_RADIUS,
            prevX,
            prevZ,
          );
          pos.x = clamped.x;
          pos.z = clamped.z;
        }
      }

      // Reconcile: snap on a true reposition (respawn/knockback/blink); while
      // actively moving (toward a destination OR chasing a target) trust the
      // prediction — it matches the server by construction; only when idle settle
      // gently onto the server.
      const err = Math.hypot(pos.x - latest.x, pos.z - latest.z);
      if (err > TELEPORT_SNAP) {
        pos.set(latest.x, 0, latest.z);
        arrivedAt.current = 0;
      } else {
        // Settle at a gentle rate (4.0) while moving to absorb minor circle-sliding lateral drift,
        // and a fast rate (SETTLE_RATE = 10) when idle for instant alignment.
        const isMoving = dest.active || attacking || dashing;
        const activeSettleRate = isMoving ? 4.0 : SETTLE_RATE;

        const holding =
          !isMoving &&
          arrivedAt.current > 0 &&
          performance.now() - arrivedAt.current < ARRIVE_HOLD_MS &&
          err > 0.05;

        if (!holding) {
          if (!isMoving) arrivedAt.current = 0;
          const t = 1 - Math.exp(-activeSettleRate * delta);

          const vx = (pos.x - prevX) / (delta || 1e-6);
          const vz = (pos.z - prevZ) / (delta || 1e-6);
          const speed = Math.hypot(vx, vz);

          if (isMoving && speed > 0.01) {
            // Reconcile ONLY lateral (perpendicular) drift to keep client and server sliding paths
            // in sync around obstacles, while leaving the longitudinal lead (latency lag) untouched.
            const nvx = vx / speed;
            const nvz = vz / speed;
            const dx = pos.x - latest.x;
            const dz = pos.z - latest.z;
            const dot = dx * nvx + dz * nvz;
            const perpX = dx - dot * nvx;
            const perpZ = dz - dot * nvz;

            pos.x -= perpX * t;
            pos.z -= perpZ * t;
          } else {
            // When idle or stopped, settle the entire position onto the server.
            pos.x = MathUtils.lerp(pos.x, latest.x, t);
            pos.z = MathUtils.lerp(pos.z, latest.z, t);
          }
        }
      }

      // Gun Mode Zombie: the local body faces where you're aiming (not the move
      // direction) — first person tracks the mouse-look yaw, top-down tracks the
      // cursor. Override the predicted rotation each frame for zero-latency facing.
      if (useGameStore.getState().gunMode) {
        if (useGameStore.getState().gunView === 'fps') {
          if (isFpsEngaged()) predictedRot.current = getFpsAim().yaw;
        } else {
          const cur = getCursorGround();
          const cdx = cur.x - pos.x;
          const cdz = cur.z - pos.z;
          if (Math.hypot(cdx, cdz) > 1e-3) predictedRot.current = Math.atan2(cdx, cdz);
        }
      }

      node.position.x = pos.x;
      node.position.z = pos.z;
      if (body.current) body.current.rotation.y = predictedRot.current;
      setLocalRenderTransform(pos.x, pos.z, predictedRot.current);
    } else {
      // Remote: render ~INTERP_DELAY in the past, interpolating between the two
      // bracketing snapshots → constant-velocity, jitter-free motion.
      const s = sampleTransform(sessionId, performance.now() - INTERP_DELAY_MS);
      if (s) {
        node.position.x = s.x;
        node.position.y = s.y;
        node.position.z = s.z;
        if (body.current) body.current.rotation.y = s.rotation;
      }
    }

    // Animation. The LOCAL player predicts its own (zero latency) from rendered
    // speed + locally-queued one-shot events; REMOTE players render the server's
    // authoritative `animState` directly (Phase 9.2).
    const sdx = node.position.x - prevPos.current.x;
    const sdz = node.position.z - prevPos.current.z;
    prevPos.current.x = node.position.x;
    prevPos.current.z = node.position.z;
    // Rendered ground speed (local & remote) — feeds the run-clip timeScale match.
    const moved = Math.hypot(sdx, sdz);
    speedRef.current = delta > 0 && moved < TELEPORT_STEP ? moved / delta : 0;
    if (isLocal || latest.skinId === 'skin.zombie.miniboss') {
      const speed = speedRef.current;
      const predicted = fsm.current.step(
        { speed, alive: true, event: consumeAnimationEvent(sessionId) },
        delta * 1000,
      );
      // Surface server-driven one-shots the client can't predict (auto-attacks),
      // but only while we're standing still — never override locomotion, or a
      // pose taken mid-run would freeze the body and slide across the ground.
      const sv = latest.animState;
      animName.current =
        predicted === 'idle' && (sv === 'attack' || sv === 'cast' || sv === 'hit')
          ? sv
          : predicted;
    } else {
      animName.current = latest.animState;
    }

    // HP bar fill, left-anchored.
    if (hpFill.current && shieldFill.current) {
      const hpRatio = clamp(latest.hp / latest.maxHp, 0, 1);
      const shieldRatio = clamp(latest.shield / latest.maxHp, 0, 1 - hpRatio);

      hpFill.current.scale.x = Math.max(0.001, hpRatio);
      hpFill.current.position.x = -(HP_BAR_WIDTH * (1 - hpRatio)) / 2;

      shieldFill.current.scale.x = Math.max(0.001, shieldRatio);
      shieldFill.current.position.x = -HP_BAR_WIDTH / 2 + hpRatio * HP_BAR_WIDTH + (shieldRatio * HP_BAR_WIDTH) / 2;
      shieldFill.current.visible = latest.shield > 0;
    }
  });

  /** Left-click an enemy to attack-move + auto-attack it (right-click still moves). */
  const onPlayerClick = (e: { nativeEvent: MouseEvent; stopPropagation: () => void }) => {
    if (e.nativeEvent.button !== 0) return;
    const latest = useGameStore.getState().players.get(sessionId);
    if (!latest) return;
    e.stopPropagation();
    if (useGameStore.getState().room === 'arena') {
      if (!latest.alive) return;
      // Auto-attacks are a feature flag (off by default — abilities-only combat);
      // when disabled, clicking an enemy does nothing.
      if (!useCombatFlagsStore.getState().autoAttack) return;
      // Issuing an attack cancels any pending move order (mirrors the server):
      // the chase below owns movement now — otherwise a stale destination would
      // fight the chase and rubber-band the player.
      clearDestination();
      sendAttack(sessionId);
      useTargetStore.getState().setTarget(sessionId);
    } else {
      // Town: inspect the clicked player (UO-style paperdoll).
      usePaperdollStore.getState().open({
        sessionId,
        name: latest.name,
        characterClass: latest.characterClass,
        level: latest.level,
        xp: latest.xp,
        kills: latest.kills,
        deaths: latest.deaths,
        skinId: latest.skinId,
        dyeId: latest.dyeId,
        pedestalId: latest.pedestalId,
        titleId: latest.titleId,
        rimId: latest.rimId,
        weaponId: latest.weaponId ?? '',
        enchantId: latest.enchantId ?? '',
        pid: latest.pid ?? 0,
      });
    }
  };

  return (
    <group ref={group}>
      {/* Only the body turns to face movement (see `body` ref) — the nameplate,
          HP bar, and ground rings below stay rotation-free so they don't wobble. */}
      <group ref={body} visible={!hideOwnBody}>
        {/* Zombies render lightweight (no shadows, frustum-culled) — dozens of
            rigged hordlings would otherwise flood the shadow pass + skinning. */}
        <CharacterModel
          descriptor={descriptor}
          getAnimation={getAnimation}
          getSpeed={getSpeed}
          lightweight={isZombieSkin(player?.skinId ?? '')}
          paint={paint}
          enchant={enchant}
          ownerId={sessionId}
        />
        {/* Yellow triangle marker pointing in the facing direction */}
        {(inArena || isLocal) && !isZombieSkin(skinId) && (
          <mesh
            position={[0, 0.08, inArena ? 0.9 : 0.625]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[1, 1, 0.001]}
            renderOrder={10}
          >
            <coneGeometry args={[0.11, 0.3, 3]} />
            <meshBasicMaterial color="#ffea00" depthWrite={false} polygonOffset polygonOffsetFactor={-10} fog={false} />
          </mesh>
        )}
      </group>

      {/* Pickable object carried over the head (molotov / grenade). */}
      <HeldItem sessionId={sessionId} />

      {/* Chat speech bubble above the head (mirrors what the player typed). */}
      {bubble && (
        <Html position={[0, bubbleY, 0]} center zIndexRange={[20, 0]}>
          <div
            key={bubble.nonce}
            className="pointer-events-none relative w-max max-w-[280px] -translate-y-1/2 whitespace-pre-wrap rounded-2xl border border-black/10 bg-white/95 px-4 py-2.5 text-center text-[18px] font-semibold leading-snug text-[#14151d] shadow-xl"
          >
            {bubble.text}
            <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[9px] border-t-[11px] border-x-transparent border-t-white/95" />
          </div>
        </Html>
      )}

      {/* Invisible click hitbox for targeting enemies (left-click). */}
      {!isLocal && (
        <mesh position={[0, 1, 0]} onPointerDown={onPlayerClick}>
          <cylinderGeometry args={[0.7, 0.7, 2, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* Team halo on the ground — blue vs red, matching the minimap. Arena only
          (town is teamless), and an outer ring so the "you" / target rings still
          read on top of it. */}
      {inArena && (
        <mesh
          position={[0, 0.015, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={sharedTeamHaloGeom}
          material={player?.team === 'red' ? sharedTeamHaloMaterialRed : sharedTeamHaloMaterialBlue}
        />
      )}

      {/* Local-player marker ring on the ground — white so "you" stays distinct
          from the blue team color. */}
      {isLocal && (
        <mesh
          position={[0, 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={sharedLocalPlayerGeom}
          material={sharedLocalPlayerMaterial}
        />
      )}

      {/* Red target ring on the enemy the local player is attacking. */}
      {!isLocal && isTargeted && (
        <mesh
          position={[0, 0.03, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={sharedTargetGeom}
          material={sharedTargetMaterial}
        />
      )}

      {/* Name + HP bar always face the camera (billboarded), independent of
          the character's facing. */}
      <Billboard ref={billboardRef} position={[0, billboardY, 0]}>
        <group ref={hpBar}>
          <mesh geometry={sharedHpBarBgGeom} material={sharedHpBarBgMaterial} />
          <mesh ref={hpFill} position={[0, 0, 0.001]} geometry={sharedHpBarFillGeom} material={sharedHpBarFillMaterial} />
          <mesh ref={shieldFill} position={[0, 0, 0.0015]} visible={false} geometry={sharedHpBarFillGeom} material={sharedShieldFillMaterial} />
          {/* LoL-style segment ticks: one divider per HP_PER_CHUNK of max health,
              drawn over the fill so the bar reads as discrete chunks. */}
          {!isZombieSkin(skinId) && Array.from({ length: chunkCount - 1 }, (_, i) => (
            <mesh
              key={i}
              position={[-HP_BAR_WIDTH / 2 + (HP_BAR_WIDTH * (i + 1)) / chunkCount, 0, 0.002]}
              geometry={sharedTickGeom}
              material={sharedTickMaterial}
            />
          ))}
        </group>
        {isZombieSkin(skinId) ? (
          // Pre-rendered text texture for zombies - zero performance cost
          <mesh position={[0, 0.25, 0.002]} geometry={sharedZombieNameGeom} material={getZombieNameMaterial(player?.name ?? 'Zombie')} />
        ) : (
          <Text
            position={[0, 0.2, 0]}
            fontSize={0.32}
            color="#e6e9f5"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            {player?.name ?? ''}
          </Text>
        )}
        {/* Equipped title, sitting just above the name (tinted by its rarity). */}
        {title && !isZombieSkin(skinId) && (
          <Text
            position={[0, 0.56, 0]}
            fontSize={0.2}
            color={title.color}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.015}
            outlineColor="#000000"
          >
            {title.text.toUpperCase()}
          </Text>
        )}
      </Billboard>
    </group>
  );
}

/**
 * The pickable object a player is carrying, floating over their head. Reads the
 * replicated `holding` flag each snapshot (~20/s) and renders the matching mesh;
 * nothing when empty-handed. Lives inside the player group so it tracks the body.
 */
function HeldItem({ sessionId }: { sessionId: string }) {
  // Subscribe to just this player's `holding` so we re-render when the carried
  // item changes — not on every snapshot tick.
  const holding = useGameStore((s) => s.players.get(sessionId)?.holding ?? '');
  if (!holding) return null;
  return (
    <group position={[0, PICKABLE_CARRY_Y, 0]}>
      <PickableVisual kind={holding} />
    </group>
  );
}

