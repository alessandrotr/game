import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide, Vector3, type Group, type Mesh, type ShaderMaterial } from 'three';
import { ABILITIES } from '@arena/shared';
import { useAbilityTargeting } from '../store/abilityTargeting';
import { getCursorGround } from '../store/cursorState';
import { getLocalRenderTransform } from '../store/localPlayer';
import { useGameStore } from '../store/useGameStore';
import { UV_VERTEX, useUTime } from '../render/shaders/common';
import {
  CIRCLE_INDICATOR_FRAG,
  INDICATOR_CYAN_RGB,
  LANE_INDICATOR_FRAG,
  RAIL_X,
  RING_R,
  tickCounts,
} from '../render/shaders/indicators';

/**
 * The on-ground aim indicator for the ability you're currently holding to aim,
 * styled after League of Legends spell indicators — a glowing cyan rim with
 * rune tick marks, a chevron-tipped skillshot lane, and subtle live animation,
 * all drawn with SDF + derivative-AA procedural shaders (see indicators.ts):
 *
 * - `direction` skillshots → a transparent **lane** rooted at the caster, its
 *   rails on the projectile's hit capsule and the full length of its range,
 *   rotating to point at the cursor, capped with a chevron arrowhead.
 * - `point` ground-targets → a **range circle** drawn around the caster plus an
 *   **area target** disc that follows the cursor, clamped to the range circle.
 *
 * Purely visual — `useAbilityHotkeys` fires on key release; right-click / Esc
 * cancel. Only one indicator is ever mounted (the pending ability), so the
 * shaders cost effectively nothing.
 */

const CYAN = () => new Vector3(...INDICATOR_CYAN_RGB);

export function GroundTargeter() {
  const pending = useAbilityTargeting((s) => s.pending);

  const dirGroup = useRef<Group>(null);
  const rangeRing = useRef<Mesh>(null);
  const target = useRef<Group>(null);

  const laneMat = useRef<ShaderMaterial>(null);
  const rangeMat = useRef<ShaderMaterial>(null);
  const targetMat = useRef<ShaderMaterial>(null);
  // Advance each material's `uTime` every frame (no-ops while its mesh is unmounted).
  useUTime(laneMat);
  useUTime(rangeMat);
  useUTime(targetMat);

  const sessionId = useGameStore((s) => s.sessionId);
  const me = useGameStore((s) => sessionId ? s.players.get(sessionId) : null);
  const aoeSizeBonus = useMemo(() => {
    if (!me) return 0;
    let bonus = 0;
    const myPerks = [me.perk1, me.perk2, me.perk3];
    for (const perkId of myPerks) {
      if (perkId === 'wide_reach') bonus += 1;
      else if (perkId === 'blast_master') bonus += 2;
      else if (perkId === 'cataclysm') bonus += 3;
    }
    return bonus;
  }, [me?.perk1, me?.perk2, me?.perk3]);

  // Per-ability shader inputs (geometry dims + uniforms). `pending` rarely
  // changes, so rebuilding these on change is free.
  const cfg = pending ? ABILITIES[pending] : null;
  const radius = (cfg?.aoeRadius ?? 2) + aoeSizeBonus;
  const range = cfg?.range ?? 1;

  const laneUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: CYAN() },
      uSeed: { value: Math.random() * 10 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending],
  );

  const rangeUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: CYAN() },
      uFill: { value: 0 },
      uTicks: { value: tickCounts(range).minor },
      uSeed: { value: Math.random() * 10 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending],
  );

  const targetUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: CYAN() },
      uFill: { value: 1 },
      uTicks: { value: tickCounts(radius).minor },
      uSeed: { value: Math.random() * 10 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, radius],
  );

  // Lane geometry: width set so the crisp rails land exactly on the hit capsule
  // (2 × projectileRadius), length = how far the projectile flies.
  const lane = useMemo(() => {
    if (!cfg || cfg.aim !== 'direction') return null;
    const hitWidth = Math.max(0.5, (cfg.projectileRadius ?? 0.45) * 2);
    return { planeWidth: hitWidth / RAIL_X, length: cfg.projectileRange ?? cfg.range };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  useFrame(() => {
    if (!cfg) return;
    const me = getLocalRenderTransform();
    const cur = getCursorGround();
    let dx = cur.x - me.x;
    let dz = cur.z - me.z;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist;
    dz /= dist;

    if (cfg.aim === 'direction' && dirGroup.current) {
      dirGroup.current.position.set(me.x, 0.05, me.z);
      dirGroup.current.rotation.y = Math.atan2(dx, dz);
    } else if (cfg.aim === 'point') {
      const reach = Math.min(dist, cfg.range);
      if (rangeRing.current) rangeRing.current.position.set(me.x, 0.04, me.z);
      if (target.current) target.current.position.set(me.x + dx * reach, 0.05, me.z + dz * reach);
    }
  });

  if (!cfg) return null;

  if (cfg.aim === 'direction' && lane) {
    return (
      <group ref={dirGroup}>
        {/* Lane laid flat, sitting just in front of the caster toward the tip. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, lane.length / 2]}>
          <planeGeometry args={[lane.planeWidth, lane.length]} />
          <shaderMaterial
            ref={laneMat}
            vertexShader={UV_VERTEX}
            fragmentShader={LANE_INDICATOR_FRAG}
            uniforms={laneUniforms}
            transparent
            depthWrite={false}
            side={DoubleSide}
            blending={AdditiveBlending}
          />
        </mesh>
      </group>
    );
  }

  // point / area target. Both discs are a unit 2×2 plane scaled so the bright
  // rim lands exactly on the world radius (the shader's ring sits at RING_R).
  const rangeScale = range / RING_R;
  const targetScale = radius / RING_R;
  return (
    <>
      {/* Max-range circle around the caster (rim + ticks only, no interior fill). */}
      <mesh
        ref={rangeRing}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.04, 0]}
        scale={[rangeScale, rangeScale, rangeScale]}
      >
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={rangeMat}
          vertexShader={UV_VERTEX}
          fragmentShader={CIRCLE_INDICATOR_FRAG}
          uniforms={rangeUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Area-of-effect target following the cursor (clamped to range). */}
      <group ref={target}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[targetScale, targetScale, targetScale]}>
          <planeGeometry args={[2, 2]} />
          <shaderMaterial
            ref={targetMat}
            vertexShader={UV_VERTEX}
            fragmentShader={CIRCLE_INDICATOR_FRAG}
            uniforms={targetUniforms}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      </group>
    </>
  );
}
