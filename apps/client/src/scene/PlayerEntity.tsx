import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html, Text } from '@react-three/drei';
import { Vector3, type Group, type Mesh } from 'three';
import {
  PICKABLE_CARRY_Y,
  getCosmeticOfType,
  isZombieSkin,
  ZOMBIE_MINIBOSS_SKIN_ID,
  TITAN_SKIN_ID,
  TITAN_SCALE,
  type AnimationName,
  type CharacterClass,
} from '@arena/shared';
import { TEAM_COLORS } from '../lib/teamColors';
import { useGameStore } from '../store/useGameStore';
import { useCombatFlagsStore } from '../store/useCombatFlagsStore';
import { useDebugStore } from '../store/useDebugStore';
import { clearLocalRenderTransform, setLocalRenderTransform } from '../store/localPlayer';
import { isNetDebug } from '../store/netDebug';
import { clearDestination } from '../store/destinationState';
import { useTargetStore } from '../store/targetState';
import { usePaperdollStore } from '../store/usePaperdollStore';
import { useSpeechStore } from '../store/useSpeechStore';
import { sendAttack } from '../network/colyseus';
import { sampleTransform, INTERP_DELAY_MS } from '../store/snapshotBuffer';
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

/** How far in the past (ms) the LOCAL player is rendered, so its motion can be
 *  interpolated between the two bracketing server snapshots (true-speed, fluid).
 *  Smaller = more responsive but more prone to a brief hold if a snapshot is late;
 *  must exceed one snapshot interval (~50ms). Remotes use a larger delay. */
const LOCAL_INTERP_DELAY_MS = 70;
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
  // Only the body turns to face movement; the node itself never rotates, so the
  // billboarded nameplate / HP bar (and the ground rings) sit perfectly still
  // over the player instead of swinging a frame behind the body's turn.
  const body = useRef<Group>(null);
  const hpFill = useRef<Mesh>(null);
  const shieldFill = useRef<Mesh>(null);
  // The floating health bar (background + fill); hidden while dead.
  const hpBar = useRef<Group>(null);
  // Net-debug: a red ghost drawn at the SERVER position of the local player (F10).
  const serverGhost = useRef<Mesh>(null);

  // Class/skin/name are assigned at join and don't change — read once at mount.
  const player = useGameStore.getState().players.get(sessionId);
  const isLocal = useGameStore.getState().sessionId === sessionId;
  const isTargeted = useTargetStore((s) => s.targetId === sessionId);
  // Team halo only reads as meaningful in the arena (town is teamless/FFA).
  const inArena = useGameStore((s) => s.room === 'arena');
  const teamColor = TEAM_COLORS[player?.team === 'red' ? 'red' : 'blue'];
  // Dev-only perf toggle: hide the floating nameplate + HP bar (Leva "Perf Debug").
  const hideNameplates = useDebugStore((s) => s.hideNameplates);
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
  const isMiniBoss = skinId === ZOMBIE_MINIBOSS_SKIN_ID;
  const isTitan = skinId === TITAN_SKIN_ID;
  const scaleMult = isTitan ? TITAN_SCALE : isMiniBoss ? 2.5 : 1;
  const billboardY = 2.7 * scaleMult;
  const bubbleY = 3.4 * scaleMult;

  // Selective store listener: only trigger a re-render when the rage threshold is crossed,
  // preventing constant re-renders/useMemo updates on every HP fluctuation. The Titan
  // shares the berserk cue (it enters its Devourer Singularity phase at 50%).
  const isRaged = useGameStore((s) => {
    const p = s.players.get(sessionId);
    if (!p) return false;
    return (
      (p.skinId === ZOMBIE_MINIBOSS_SKIN_ID || p.skinId === TITAN_SKIN_ID) &&
      p.hp < p.maxHp * 0.5
    );
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
      clearCastAim(sessionId);
      clearWeaponTip(sessionId);
      if (isLocal) clearLocalRenderTransform();
    };
  }, [isLocal, sessionId]);

  useFrame((_, delta) => {
    const node = group.current;
    const latest = useGameStore.getState().players.get(sessionId);
    if (!node || !latest) return;

    // The floating health bar freezes mid-frame when a player dies (the update
    // below early-returns), so it would read full of HP. Hide it while dead.
    if (hpBar.current) hpBar.current.visible = latest.alive;

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
      // OPTION 2 — no client-side prediction. Play back the AUTHORITATIVE server
      // motion by interpolating between snapshots a short delay in the past: this
      // renders at the server's TRUE speed (no easing/heaviness) and can never
      // disagree with the server (no rubber-band, no jitter). Movement + ability
      // input still go to the server. A big jump (respawn/teleport/blink) snaps.
      if (!predicted.current) predicted.current = new Vector3(latest.x, latest.y, latest.z);
      const rp = predicted.current;
      const s = sampleTransform(sessionId, performance.now() - LOCAL_INTERP_DELAY_MS);
      // If the latest authoritative pos is far from the interpolated sample, it's a
      // real reposition (respawn/blink) — snap to it rather than sliding across.
      if (!s || Math.hypot(latest.x - s.x, latest.z - s.z) > TELEPORT_SNAP) {
        rp.set(latest.x, latest.y, latest.z);
        predictedRot.current = latest.rotation;
      } else {
        rp.set(s.x, s.y, s.z);
        predictedRot.current = s.rotation;
      }
      node.position.set(rp.x, rp.y, rp.z);
      if (body.current) body.current.rotation.y = predictedRot.current;
      setLocalRenderTransform(rp.x, rp.z, predictedRot.current);

      // F10 debug ghost — shows the very latest server pos vs the interpolated body
      // (a small constant lag while moving; they meet when you stop).
      if (serverGhost.current) {
        const dbg = isNetDebug();
        serverGhost.current.visible = dbg;
        if (dbg) serverGhost.current.position.set(latest.x - rp.x, 0.1, latest.z - rp.z);
      }
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
    // speed + locally-queued one-shot events. REMOTE *players* (and the mini-boss)
    // also run the predicted FSM — driven by their rendered (interpolated) speed —
    // so their locomotion + cast/attack poses are smoothed the same way, instead of
    // snapping to the raw `animState` string the server replicates only ~20×/sec
    // (which makes remote casts look choppy). The cheap raw path is kept for the
    // regular horde (many zombies; the placeholder animator already clock-smooths).
    const sdx = node.position.x - prevPos.current.x;
    const sdz = node.position.z - prevPos.current.z;
    prevPos.current.x = node.position.x;
    prevPos.current.z = node.position.z;
    // Rendered ground speed (local & remote) — feeds the run-clip timeScale match.
    const moved = Math.hypot(sdx, sdz);
    speedRef.current = delta > 0 && moved < TELEPORT_STEP ? moved / delta : 0;
    const smoothedAnim =
      isLocal ||
      latest.skinId === ZOMBIE_MINIBOSS_SKIN_ID ||
      latest.skinId === TITAN_SKIN_ID ||
      !isZombieSkin(latest.skinId);
    if (smoothedAnim) {
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
      {/* Net-debug ghost (F10): red sphere at the server position, local player only. */}
      {isLocal && (
        <mesh ref={serverGhost} visible={false}>
          <sphereGeometry args={[0.35, 12, 12]} />
          <meshBasicMaterial color="#ff3030" transparent opacity={0.45} depthTest={false} />
        </mesh>
      )}
      {/* Only the body turns to face movement (see `body` ref) — the nameplate,
          HP bar, and ground rings below stay rotation-free so they don't wobble. */}
      <group ref={body}>
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
          the character's facing. (Dev "Perf Debug" can hide these to measure cost.) */}
      {!hideNameplates && (
      <Billboard position={[0, billboardY, 0]}>
        <group ref={hpBar}>
          <mesh>
            <planeGeometry args={[HP_BAR_WIDTH, 0.12]} />
            <meshBasicMaterial color="#1a1f2e" />
          </mesh>
          <mesh ref={hpFill} position={[0, 0, 0.001]}>
            <planeGeometry args={[HP_BAR_WIDTH, 0.1]} />
            <meshBasicMaterial color="#4ade80" />
          </mesh>
          <mesh ref={shieldFill} position={[0, 0, 0.0015]} visible={false}>
            <planeGeometry args={[HP_BAR_WIDTH, 0.1]} />
            <meshBasicMaterial color="#aab4ff" />
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
        {/* Equipped title, sitting just above the name (tinted by its rarity). */}
        {title && (
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
      )}
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

