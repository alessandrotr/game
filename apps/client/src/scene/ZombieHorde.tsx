import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import {
  Euler,
  type Group,
  type InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import {
  ZOMBIE_SKIN_ID,
  ZOMBIE_SPRINTER_SKIN_ID,
  ZOMBIE_FAT_SKIN_ID,
  type CharacterClass,
} from '@arena/shared';
import { resolveCharacter } from '../assets/CharacterFactory';
import { getMergedProp } from '../render/mergeGeometry';
import { MergedGroupMaterial } from '../render/MergedGroupMesh';
import { glassMaterialFor } from '../render/glassMaterial';
import { useGameStore } from '../store/useGameStore';
import { sampleTransform, INTERP_DELAY_MS } from '../store/snapshotBuffer';

/**
 * Batched renderer for the regular zombie horde (standard / sprinter / fat).
 *
 * Bodies and HP bars are drawn as a handful of InstancedMeshes per variant (a few
 * draws for the whole crowd). The NAMES are the player's real Troika <Text> — one
 * per zombie — so they're pixel-identical to a player's nameplate; that's the only
 * per-entity cost, and it still keeps the bulk of the draw-call win.
 *
 * Instance matrices reproduce the per-entity look exactly: interpolated server
 * position · facing yaw · variant scale · procedural-anim offset. The mini-boss is
 * NOT here (singular + FSM + 2.5× + rage) — it stays a PlayerEntity.
 */

const HORDE_SKINS = [ZOMBIE_SKIN_ID, ZOMBIE_SPRINTER_SKIN_ID, ZOMBIE_FAT_SKIN_ID];
const MAX_PER_VARIANT = 64;

// Gaps (world units) above the body's actual head top (tuned to sit like the
// player's nameplate — bar above the head, name above the bar).
const BAR_GAP = 0.46;
const NAME_GAP = 0.58;
const BAR_W = 1.0;

// Bar quads mirror PlayerEntity's HP bar exactly (HP_BAR_WIDTH=1, bg 0.12, fill 0.1).
const BAR_BG_GEO = new PlaneGeometry(BAR_W, 0.12);
const BAR_FILL_GEO = new PlaneGeometry(BAR_W, 0.1);
const BAR_BG_MAT = new MeshBasicMaterial({ color: '#1a1f2e', transparent: true, depthWrite: false });
const BAR_FILL_MAT = new MeshBasicMaterial({ color: '#4ade80', transparent: true, depthWrite: false });

// Scratch — reused every frame, no per-frame allocation.
const _base = new Matrix4();
const _proc = new Matrix4();
const _final = new Matrix4();
const _pos = new Vector3();
const _eY = new Euler(0, 0, 0, 'YXZ');
const _qY = new Quaternion();
const _eP = new Euler(0, 0, 0, 'YXZ');
const _qP = new Quaternion();
const _scale = new Vector3();
const _procPos = new Vector3();
const _procScale = new Vector3();
const _bb = new Matrix4();
const _bbPos = new Vector3();
const _bbScale = new Vector3();
const _camRight = new Vector3();

/** Geometry-derived head top per variant (cached) — so labels/bars sit snug on any
 *  body size, like the player's, instead of a guessed fixed height. */
const topYCache = new Map<string, number>();
function hordeTopY(skinId: string): number {
  let v = topYCache.get(skinId);
  if (v === undefined) {
    const desc = resolveCharacter('warrior' as CharacterClass, skinId);
    v = 0;
    if (desc.render.kind === 'placeholder') {
      const s = desc.render.scale ?? 1;
      for (const g of getMergedProp(desc.render).groups) {
        g.geometry.computeBoundingBox();
        if (g.geometry.boundingBox) v = Math.max(v, g.geometry.boundingBox.max.y);
      }
      v *= s;
    }
    topYCache.set(skinId, v);
  }
  return v;
}

/** Stable per-zombie phase so the crowd doesn't bob in lockstep. */
function phaseFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * Math.PI * 2;
}

const _o = { y: 0, z: 0, rx: 0, rz: 0, s: 1 };
/** Procedural-animation offset for an anim state — 1:1 port of useProceduralAnimator. */
function proceduralOffset(anim: string, t: number, phase: number): void {
  _o.y = 0;
  _o.z = 0;
  _o.rx = 0;
  _o.rz = 0;
  _o.s = 1;
  switch (anim) {
    case 'idle':
      _o.y = Math.sin(t * 2 + phase) * 0.04;
      break;
    case 'run':
    case 'walk':
      _o.y = Math.abs(Math.sin(t * 9 + phase)) * 0.12;
      break;
    case 'cast':
      _o.s = 1 + Math.sin(t * 16) * 0.05;
      break;
    case 'attack': {
      const swing = Math.abs(Math.sin(t * 14));
      _o.z = swing * 0.35;
      _o.rx = -swing * 0.28;
      break;
    }
    case 'hit':
      _o.rz = Math.sin(t * 40) * 0.06;
      break;
    case 'die':
      _o.rz = Math.PI / 2;
      _o.y = -0.3;
      break;
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Instanced bodies + HP bars for one variant. */
function InstancedZombieVariant({ skinId }: { skinId: string }) {
  const glass = useThree((s) => glassMaterialFor(s.gl));
  const bodyMeshes = useRef<(InstancedMesh | null)[]>([]);
  const barBg = useRef<InstancedMesh>(null);
  const barFill = useRef<InstancedMesh>(null);

  const { groups, descScale, barY } = useMemo(() => {
    const desc = resolveCharacter('warrior' as CharacterClass, skinId);
    if (desc.render.kind !== 'placeholder') return { groups: [], descScale: 1, barY: 1.8 };
    return {
      groups: getMergedProp(desc.render).groups,
      descScale: desc.render.scale ?? 1,
      barY: hordeTopY(skinId) + BAR_GAP,
    };
  }, [skinId]);

  useFrame((state) => {
    const players = useGameStore.getState().players;
    const t = state.clock.elapsedTime;
    const renderTime = performance.now() - INTERP_DELAY_MS;
    const camQuat = state.camera.quaternion;
    _camRight.set(1, 0, 0).applyQuaternion(camQuat);

    let i = 0; // body index (all present, incl. dying)
    let j = 0; // bar index (alive only)
    players.forEach((p, id) => {
      if (p.skinId !== skinId || i >= MAX_PER_VARIANT) return;
      const s = sampleTransform(id, renderTime);
      const x = s ? s.x : p.x;
      const y = s ? s.y : p.y;
      const z = s ? s.z : p.z;
      const yaw = s ? s.rotation : p.rotation;

      proceduralOffset(p.animState, t, phaseFor(id));
      _pos.set(x, y, z);
      _eY.set(0, yaw, 0);
      _qY.setFromEuler(_eY);
      _scale.set(descScale, descScale, descScale);
      _base.compose(_pos, _qY, _scale);
      _procPos.set(0, _o.y, _o.z);
      _eP.set(_o.rx, 0, _o.rz);
      _qP.setFromEuler(_eP);
      _procScale.set(_o.s, _o.s, _o.s);
      _proc.compose(_procPos, _qP, _procScale);
      _final.multiplyMatrices(_base, _proc);
      for (const m of bodyMeshes.current) if (m) m.setMatrixAt(i, _final);
      i++;

      if (!p.alive || j >= MAX_PER_VARIANT) return;
      if (barBg.current) {
        _bbPos.set(x, y + barY, z);
        _bb.compose(_bbPos, camQuat, _scale.set(1, 1, 1));
        barBg.current.setMatrixAt(j, _bb);
      }
      if (barFill.current) {
        const ratio = p.maxHp > 0 ? clamp01(p.hp / p.maxHp) : 1;
        _bbPos.set(x, y + barY, z).addScaledVector(_camRight, -(BAR_W * (1 - ratio)) / 2);
        _bbScale.set(Math.max(0.001, ratio), 1, 1);
        _bb.compose(_bbPos, camQuat, _bbScale);
        barFill.current.setMatrixAt(j, _bb);
      }
      j++;
    });

    for (const m of bodyMeshes.current) {
      if (!m) continue;
      m.count = i;
      m.instanceMatrix.needsUpdate = true;
    }
    for (const m of [barBg.current, barFill.current]) {
      if (!m) continue;
      m.count = j;
      m.instanceMatrix.needsUpdate = true;
    }
  });

  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((g, gi) => (
        <instancedMesh
          key={g.key}
          ref={(el) => (bodyMeshes.current[gi] = el)}
          args={[g.geometry, undefined, MAX_PER_VARIANT]}
          castShadow={g.castShadow}
          receiveShadow={g.receiveShadow}
          frustumCulled={false}
        >
          <MergedGroupMaterial group={g} glass={glass} />
        </instancedMesh>
      ))}
      <instancedMesh ref={barBg} args={[BAR_BG_GEO, BAR_BG_MAT, MAX_PER_VARIANT]} frustumCulled={false} />
      <instancedMesh
        ref={barFill}
        args={[BAR_FILL_GEO, BAR_FILL_MAT, MAX_PER_VARIANT]}
        frustumCulled={false}
      />
    </>
  );
}

/** One zombie's nameplate — the player's real Troika <Text>, billboarded above the
 *  head and position-tracked imperatively (no per-frame React churn). */
function ZombieName({ id }: { id: string }) {
  const board = useRef<Group>(null);
  const p0 = useGameStore.getState().players.get(id);
  const name = p0?.name ?? 'Zombie';
  const topY = useMemo(() => hordeTopY(p0?.skinId ?? '') + NAME_GAP, [p0?.skinId]);

  useFrame(() => {
    const g = board.current;
    if (!g) return;
    const p = useGameStore.getState().players.get(id);
    if (!p || !p.alive) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const s = sampleTransform(id, performance.now() - INTERP_DELAY_MS);
    g.position.set(s ? s.x : p.x, (s ? s.y : p.y) + topY, s ? s.z : p.z);
  });

  return (
    <Billboard ref={board}>
      <Text
        fontSize={0.32}
        color="#e6e9f5"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {name}
      </Text>
    </Billboard>
  );
}

/** One Troika nameplate per live horde zombie (re-lists only when the set changes). */
function ZombieNames() {
  const playerIds = useGameStore((s) => s.playerIds);
  const ids = useMemo(() => {
    const players = useGameStore.getState().players;
    return playerIds.filter((id) => {
      const skin = players.get(id)?.skinId;
      return !!skin && HORDE_SKINS.includes(skin);
    });
  }, [playerIds]);
  return (
    <>
      {ids.map((id) => (
        <ZombieName key={id} id={id} />
      ))}
    </>
  );
}

export function ZombieHorde() {
  return (
    <>
      {HORDE_SKINS.map((skin) => (
        <InstancedZombieVariant key={skin} skinId={skin} />
      ))}
      <ZombieNames />
    </>
  );
}
