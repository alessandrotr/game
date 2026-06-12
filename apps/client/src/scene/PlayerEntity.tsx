import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html, Text } from '@react-three/drei';
import { MathUtils, Vector3, type Group, type Mesh } from 'three';
import {
  ARENA_HALF_SIZE,
  AUTO_ATTACKS,
  TOWN_HALF_SIZE,
  TOWN_OBSTACLES,
  PLAYER_RADIUS,
  collideObstacles,
  stepLocomotion,
  type AnimationName,
  type CharacterClass,
} from '@arena/shared';
import { useArenaLayout } from './useArenaLayout';
import { TEAM_COLORS } from '../lib/teamColors';
import { useGameStore } from '../store/useGameStore';
import { clearLocalRenderTransform, setLocalRenderTransform } from '../store/localPlayer';
import { clearDestination, getDestination } from '../store/destinationState';
import { useTargetStore } from '../store/targetState';
import { usePaperdollStore } from '../store/usePaperdollStore';
import { useSpeechStore } from '../store/useSpeechStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { sendAttack } from '../network/colyseus';
import { sampleTransform, INTERP_DELAY_MS } from '../store/snapshotBuffer';
import { getLocalMovement } from '../tuning';
import { resolveCharacter } from '../assets/CharacterFactory';
import { CharacterModel } from '../render/CharacterModel';
import { createCharacterFSM } from '../render/animation/animationStateMachine';
import { clearAnimationEvents, consumeAnimationEvent } from '../render/animation/animationEvents';

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
  const hpFill = useRef<Mesh>(null);
  // The floating health bar (background + fill); hidden while dead.
  const hpBar = useRef<Group>(null);
  // Tracks the alive→dead edge so the death burst fires exactly once.
  const wasAlive = useRef(true);

  // Class/skin/name are assigned at join and don't change — read once at mount.
  const player = useGameStore.getState().players.get(sessionId);
  const isLocal = useGameStore.getState().sessionId === sessionId;
  const isTargeted = useTargetStore((s) => s.targetId === sessionId);
  // Team halo only reads as meaningful in the arena (town is teamless/FFA).
  const inArena = useGameStore((s) => s.room === 'arena');
  const teamColor = TEAM_COLORS[player?.team === 'red' ? 'red' : 'blue'];
  // Max HP is constant per class, so this selector only re-renders on a class
  // change — it drives how many segment ticks the floating bar is divided into.
  const maxHp = useGameStore((s) => s.players.get(sessionId)?.maxHp ?? 0);
  const chunkCount = Math.max(1, Math.round(maxHp / HP_PER_CHUNK));
  const bubble = useSpeechStore((s) => s.bubbles[sessionId]);
  const descriptor = useMemo(
    () => resolveCharacter(player?.characterClass ?? 'warrior', player?.skinId),
    [player?.characterClass, player?.skinId],
  );

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

  useEffect(() => {
    // Drop any pending one-shot animation event for this session on unmount
    // (e.g. the player left), and clear the local render transform.
    return () => {
      clearAnimationEvents(sessionId);
      if (isLocal) clearLocalRenderTransform();
    };
  }, [isLocal, sessionId]);

  // This match's cover — the predictor collides against the same obstacles the
  // server generated, so prediction matches authority by construction.
  const arenaObstacles = useArenaLayout().obstacles;

  useFrame((_, delta) => {
    const node = group.current;
    const latest = useGameStore.getState().players.get(sessionId);
    if (!node || !latest) return;

    // The floating health bar freezes mid-frame when a player dies (the update
    // below early-returns), so it would read full of HP. Hide it while dead.
    if (hpBar.current) hpBar.current.visible = latest.alive;

    // On the alive→dead edge, burst a death VFX at the body so the kill reads
    // unmistakably (fires once; covers every cause — hits, dots, environment).
    if (wasAlive.current && !latest.alive) {
      useEffectsStore.getState().spawn('vfx.death', [node.position.x, 1.1, node.position.z]);
    }
    wasAlive.current = latest.alive;

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
      const mv = getLocalMovement(latest.characterClass as CharacterClass);
      const isArena = useGameStore.getState().room === 'arena';
      const halfBounds = (isArena ? ARENA_HALF_SIZE : TOWN_HALF_SIZE) - PLAYER_RADIUS;
      const dest = getDestination();

      // Auto-attack chase intent (arena only). Drop it the moment the target dies
      // so we stop chasing a corpse (the server clears its attack-target too).
      const attackId = isArena ? useTargetStore.getState().targetId : null;
      const target = attackId ? useGameStore.getState().players.get(attackId) : undefined;
      if (target && !target.alive) {
        useTargetStore.getState().setTarget(null);
      }
      const attacking = !!target && target.alive;

      if (attacking && target) {
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
          pos.z = clamp(pos.z + (dz / dist) * step, -halfBounds, halfBounds);
          // Same post-move obstacle push-out the server applies to the chase path.
          const fixed = collideObstacles(pos.x, pos.z, arenaObstacles, PLAYER_RADIUS);
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
            speed: mv.speed,
            rotationSpeed: mv.rotationSpeed,
            stoppingDistance: mv.stoppingDistance,
            halfBounds,
            obstacles: isArena ? arenaObstacles : TOWN_OBSTACLES,
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

      // Reconcile: snap on a true reposition (respawn/knockback/blink); while
      // actively moving (toward a destination OR chasing a target) trust the
      // prediction — it matches the server by construction; only when idle settle
      // gently onto the server.
      const err = Math.hypot(pos.x - latest.x, pos.z - latest.z);
      if (err > TELEPORT_SNAP) {
        pos.set(latest.x, 0, latest.z);
        arrivedAt.current = 0;
      } else if (!dest.active && !attacking) {
        // Just arrived: hold our deterministic stop point and let the server land
        // on it (avoids the backward settle / bounce). Ends as soon as the server
        // converges, or after a short safety window if it genuinely diverged.
        const holding =
          arrivedAt.current > 0 && performance.now() - arrivedAt.current < ARRIVE_HOLD_MS && err > 0.05;
        if (!holding) {
          arrivedAt.current = 0;
          const t = 1 - Math.exp(-SETTLE_RATE * delta);
          pos.x = MathUtils.lerp(pos.x, latest.x, t);
          pos.z = MathUtils.lerp(pos.z, latest.z, t);
        }
      }

      node.position.x = pos.x;
      node.position.z = pos.z;
      node.rotation.y = predictedRot.current;
      setLocalRenderTransform(pos.x, pos.z, predictedRot.current);
    } else {
      // Remote: render ~INTERP_DELAY in the past, interpolating between the two
      // bracketing snapshots → constant-velocity, jitter-free motion.
      const s = sampleTransform(sessionId, performance.now() - INTERP_DELAY_MS);
      if (s) {
        node.position.x = s.x;
        node.position.y = s.y;
        node.position.z = s.z;
        node.rotation.y = s.rotation;
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
    if (isLocal) {
      const speed = speedRef.current;
      const predicted = fsm.current.step(
        { speed, alive: true, event: consumeAnimationEvent(sessionId) },
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
      });
    }
  };

  return (
    <group ref={group}>
      <CharacterModel descriptor={descriptor} getAnimation={getAnimation} getSpeed={getSpeed} />

      {/* Chat speech bubble above the head (mirrors what the player typed). */}
      {bubble && (
        <Html position={[0, 3.4, 0]} center zIndexRange={[20, 0]}>
          <div
            key={bubble.nonce}
            className="pointer-events-none relative w-max max-w-[280px] -translate-y-1/2 whitespace-pre-wrap rounded-2xl border border-black/10 bg-white/95 px-4 py-2.5 text-center text-[18px] font-semibold leading-snug text-[#14151d] shadow-xl"
          >
            {bubble.text}
            <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[9px] border-t-[11px] border-x-transparent border-t-white/95" />
          </div>
        </Html>
      )}

      <AttackedBanner sessionId={sessionId} isLocal={isLocal} />

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
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.82, 0.98, 40]} />
          <meshBasicMaterial color={teamColor} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      )}

      {/* Local-player marker ring on the ground — white so "you" stays distinct
          from the blue team color. */}
      {isLocal && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.7, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
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
        <group ref={hpBar}>
          <mesh>
            <planeGeometry args={[HP_BAR_WIDTH, 0.12]} />
            <meshBasicMaterial color="#1a1f2e" />
          </mesh>
          <mesh ref={hpFill} position={[0, 0, 0.001]}>
            <planeGeometry args={[HP_BAR_WIDTH, 0.1]} />
            <meshBasicMaterial color="#4ade80" />
          </mesh>
          {/* LoL-style segment ticks: one divider per HP_PER_CHUNK of max health,
              drawn over the fill so the bar reads as discrete chunks. */}
          {Array.from({ length: chunkCount - 1 }, (_, i) => (
            <mesh
              key={i}
              position={[-HP_BAR_WIDTH / 2 + (HP_BAR_WIDTH * (i + 1)) / chunkCount, 0, 0.002]}
            >
              <planeGeometry args={[0.02, 0.12]} />
              <meshBasicMaterial color="#0b0e16" />
            </mesh>
          ))}
        </group>
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
