import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { MathUtils, Vector3, type Group, type Mesh } from 'three';
import {
  ARENA_HALF_SIZE,
  TOWN_HALF_SIZE,
  PLAYER_RADIUS,
  collideArenaObstacles,
  collideTownObstacles,
  type AnimationName,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { clearLocalRenderTransform, setLocalRenderTransform } from '../store/localPlayer';
import { clearDestination, getDestination } from '../store/destinationState';
import { useTargetStore } from '../store/targetState';
import { usePaperdollStore } from '../store/usePaperdollStore';
import { sendAttack } from '../network/colyseus';
import { getTuning } from '../tuning';
import { resolveCharacter } from '../assets/CharacterFactory';
import { CharacterModel } from '../render/CharacterModel';
import { createCharacterFSM } from '../render/animation/animationStateMachine';
import { clearAnimationEvents, consumeAnimationEvent } from '../render/animation/animationEvents';

/** Smoothing factor for interpolating remote players toward server snapshots. */
const REMOTE_SMOOTHING = 14;
/** How fast the predicted local position settles onto the server's once idle. */
const SETTLE_SMOOTHING = 8;
/**
 * Error beyond this (world units) hard-snaps the local player to the server.
 * Set well above lag-induced divergence: while walking, the client legitimately
 * runs ahead of the server by ~one round-trip (e.g. sprint 9 u/s × 400ms ≈ 3.6u),
 * and the client mirrors the server's speed/collision/clamp so it doesn't drift.
 * Snapping on that gap caused a rubber-band loop under real latency. Only a true
 * server reposition (respawn/knockback) clears this bar.
 */
const RESYNC_THRESHOLD = 8;
/** Per-frame horizontal step larger than this is a teleport (blink/respawn),
 *  not locomotion — don't let it flash the run animation. */
const TELEPORT_STEP = 2;
const HP_BAR_WIDTH = 1;

interface PlayerEntityProps {
  sessionId: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Interpolate an angle along the shortest path, handling the ±π wrap. */
function lerpAngle(a: number, b: number, t: number): number {
  const tau = Math.PI * 2;
  const diff = ((((b - a) % tau) + tau + Math.PI) % tau) - Math.PI;
  return a + diff * t;
}

/** Hard-snap the predicted position to the server's on large divergence. */
function reconcile(pos: Vector3, scratch: Vector3, server: { x: number; z: number }): void {
  if (pos.distanceTo(scratch.set(server.x, 0, server.z)) > RESYNC_THRESHOLD) {
    pos.copy(scratch);
  }
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
  const hpFill = useRef<Mesh>(null);

  // Class/skin/name are assigned at join and don't change — read once at mount.
  const player = useGameStore.getState().players.get(sessionId);
  const isLocal = useGameStore.getState().sessionId === sessionId;
  const isTargeted = useTargetStore((s) => s.targetId === sessionId);
  const descriptor = useMemo(
    () => resolveCharacter(player?.characterClass ?? 'warrior', player?.skinId),
    [player?.characterClass, player?.skinId],
  );

  // Predicted local-player state (lazily initialized from the first snapshot).
  const predicted = useRef<Vector3 | null>(null);
  const predictedRot = useRef(player?.rotation ?? 0);
  const serverPos = useRef(new Vector3());

  // Animation: a state machine fed each frame, exposed to the model via a stable
  // getter so the character animates without per-frame React re-renders.
  const fsm = useRef(createCharacterFSM());
  const animName = useRef<AnimationName>('idle');
  const getAnimation = useRef(() => animName.current).current;
  const prevPos = useRef({ x: player?.x ?? 0, z: player?.z ?? 0 });

  useEffect(() => {
    // Drop any pending one-shot animation event for this session on unmount
    // (e.g. the player left), and clear the local render transform.
    return () => {
      clearAnimationEvents(sessionId);
      if (isLocal) clearLocalRenderTransform();
    };
  }, [isLocal, sessionId]);

  useFrame((_, delta) => {
    const node = group.current;
    const latest = useGameStore.getState().players.get(sessionId);
    if (!node || !latest) return;

    if (!latest.alive) {
      // A dead target is no longer attackable — drop the local highlight.
      if (useTargetStore.getState().targetId === sessionId) {
        useTargetStore.getState().setTarget(null);
      }
      // Hold position and play the death pose in place (no movement while down).
      if (isLocal) {
        clearDestination();
        animName.current = fsm.current.step(
          { speed: 0, sprinting: false, alive: false, event: null },
          delta * 1000,
        );
      } else {
        animName.current = latest.animState; // authoritative ('die')
      }
      prevPos.current.x = node.position.x;
      prevPos.current.z = node.position.z;
      return;
    }

    // Vertical (jump/fall) is server-authoritative for all players.
    const yT = 1 - Math.exp(-REMOTE_SMOOTHING * delta);
    node.position.y = MathUtils.lerp(node.position.y, latest.y, yT);

    if (isLocal) {
      if (!predicted.current) {
        predicted.current = new Vector3(latest.x, 0, latest.z);
        predictedRot.current = latest.rotation;
      }
      const pos = predicted.current;
      const tuning = getTuning().player;
      // Mirror the server's bounds + obstacles for the current world, so the
      // prediction matches (town and arena have different sizes and props).
      const isArena = useGameStore.getState().room === 'arena';
      const limit = (isArena ? ARENA_HALF_SIZE : TOWN_HALF_SIZE) - PLAYER_RADIUS;
      const collide = isArena ? collideArenaObstacles : collideTownObstacles;

      const dest = getDestination();
      if (dest.active) {
        // Hold-to-move: crisp (no momentum), distance-based walk/sprint.
        const dx = dest.x - pos.x;
        const dz = dest.z - pos.z;
        const distance = Math.hypot(dx, dz);
        const remaining = distance - tuning.stoppingDistance;
        // Epsilon so arrival reliably clears the destination (and the marker).
        if (remaining > 0.02) {
          const ndx = dx / distance;
          const ndz = dz / distance;
          // Constant speed locked at issue time — no slowdown nearing the mark.
          const speed = dest.sprint ? tuning.sprintSpeed : tuning.walkSpeed;
          const step = Math.min(speed * delta, remaining);
          pos.x = clamp(pos.x + ndx * step, -limit, limit);
          pos.z = clamp(pos.z + ndz * step, -limit, limit);
          const face = Math.atan2(ndx, ndz);
          predictedRot.current = lerpAngle(
            predictedRot.current,
            face,
            1 - Math.exp(-tuning.rotationSpeed * delta),
          );
          reconcile(pos, serverPos.current, latest);
        } else {
          // Arrived. While held, MouseMove re-targets next frame; after release
          // this sticks and the character stops at the point.
          clearDestination();
        }
      } else {
        // Idle / just arrived: HOLD the predicted position. Only correct on a
        // meaningful divergence. Continuously lerping toward the snapshot here
        // yanked the player backward at the instant of arrival, because the
        // snapshot lags ~1 tick behind the (correct) predicted position.
        if (pos.distanceTo(serverPos.current.set(latest.x, 0, latest.z)) > 0.75) {
          const t = 1 - Math.exp(-SETTLE_SMOOTHING * delta);
          pos.x = MathUtils.lerp(pos.x, latest.x, t);
          pos.z = MathUtils.lerp(pos.z, latest.z, t);
        }
      }

      // Mirror the server's obstacle collision so prediction matches.
      const fixed = collide(pos.x, pos.z);
      pos.x = fixed.x;
      pos.z = fixed.z;

      node.position.x = pos.x;
      node.position.z = pos.z;
      node.rotation.y = predictedRot.current;
      setLocalRenderTransform(pos.x, pos.z, predictedRot.current);
    } else {
      const t = 1 - Math.exp(-REMOTE_SMOOTHING * delta);
      node.position.x = MathUtils.lerp(node.position.x, latest.x, t);
      node.position.z = MathUtils.lerp(node.position.z, latest.z, t);
      node.rotation.y = lerpAngle(node.rotation.y, latest.rotation, t);
    }

    // Animation. The LOCAL player predicts its own (zero latency) from rendered
    // speed + locally-queued one-shot events; REMOTE players render the server's
    // authoritative `animState` directly (Phase 9.2).
    const sdx = node.position.x - prevPos.current.x;
    const sdz = node.position.z - prevPos.current.z;
    prevPos.current.x = node.position.x;
    prevPos.current.z = node.position.z;
    if (isLocal) {
      const moved = Math.hypot(sdx, sdz);
      const speed = delta > 0 && moved < TELEPORT_STEP ? moved / delta : 0;
      const dest = getDestination();
      const sprinting = dest.active && dest.sprint;
      const predicted = fsm.current.step(
        { speed, sprinting, alive: true, event: consumeAnimationEvent(sessionId) },
        delta * 1000,
      );
      // Surface server-driven one-shots the client can't predict (auto-attacks),
      // but only when our own prediction is just locomotion — never override a
      // predicted cast/hit.
      const sv = latest.animState;
      animName.current =
        (predicted === 'idle' || predicted === 'walk' || predicted === 'run') &&
        (sv === 'attack' || sv === 'cast' || sv === 'hit')
          ? sv
          : predicted;
    } else {
      animName.current = latest.animState;
    }

    // HP bar fill, left-anchored.
    if (hpFill.current) {
      const ratio = clamp(latest.hp / latest.maxHp, 0, 1);
      hpFill.current.scale.x = Math.max(0.001, ratio);
      hpFill.current.position.x = -(HP_BAR_WIDTH * (1 - ratio)) / 2;
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
      });
    }
  };

  return (
    <group ref={group}>
      <CharacterModel descriptor={descriptor} getAnimation={getAnimation} />

      <AttackedBanner sessionId={sessionId} isLocal={isLocal} />

      {/* Invisible click hitbox for targeting enemies (left-click). */}
      {!isLocal && (
        <mesh position={[0, 1, 0]} onPointerDown={onPlayerClick}>
          <cylinderGeometry args={[0.7, 0.7, 2, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* Local-player marker ring on the ground. */}
      {isLocal && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.7, 32]} />
          <meshBasicMaterial color="#6c8cff" transparent opacity={0.8} />
        </mesh>
      )}

      {/* Red target ring on the enemy the local player is attacking. */}
      {!isLocal && isTargeted && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.78, 32]} />
          <meshBasicMaterial color="#ff5a5a" transparent opacity={0.9} />
        </mesh>
      )}

      {/* Name + HP bar always face the camera (billboarded), independent of
          the character's facing. */}
      <Billboard position={[0, 2.7, 0]}>
        <mesh>
          <planeGeometry args={[HP_BAR_WIDTH, 0.12]} />
          <meshBasicMaterial color="#1a1f2e" />
        </mesh>
        <mesh ref={hpFill} position={[0, 0, 0.001]}>
          <planeGeometry args={[HP_BAR_WIDTH, 0.1]} />
          <meshBasicMaterial color="#4ade80" />
        </mesh>
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
      </Billboard>
    </group>
  );
}

/**
 * A floating warning over a player who is being auto-attacked, visible to
 * everyone (driven by the replicated `attackTargetId`). The target reads "… is
 * attacking you!"; bystanders read "… → <target>". Refreshes with each snapshot.
 */
function AttackedBanner({ sessionId, isLocal }: { sessionId: string; isLocal: boolean }) {
  useGameStore((s) => s.tick); // re-evaluate as snapshots arrive (~20/s)
  const players = useGameStore.getState().players;
  const self = players.get(sessionId);
  if (!self || !self.alive) return null;

  let attacker: string | null = null;
  let count = 0;
  for (const p of players.values()) {
    if (p.alive && p.attackTargetId === sessionId) {
      if (!attacker) attacker = p.name;
      count++;
    }
  }
  if (!attacker) return null;

  const extra = count > 1 ? ` +${count - 1}` : '';
  const text = isLocal
    ? `⚔ ${attacker} is attacking you!${extra}`
    : `⚔ ${attacker} → ${self.name}${extra}`;

  return (
    <Billboard position={[0, 2.7, 0]}>
      <Text
        fontSize={0.26}
        color={isLocal ? '#ff6b6b' : '#ffb4b4'}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {text}
      </Text>
    </Billboard>
  );
}
