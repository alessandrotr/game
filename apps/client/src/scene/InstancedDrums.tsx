import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { type InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { assets } from '../assets/registry';
import { getMergedProp } from '../render/mergeGeometry';
import { MergedGroupMaterial } from '../render/MergedGroupMesh';
import { glassMaterialFor } from '../render/glassMaterial';
import { useGameStore } from '../store/useGameStore';

/**
 * Every oil drum (destructible, kind ≠ 'tire') shares one model, so instead of
 * rendering each as its own few meshes we draw the WHOLE field as one
 * `InstancedMesh` per merged material group — a fixed handful of draws no matter
 * how many drums are on screen. Their transforms (position + tumble) are smoothed
 * toward the 20Hz server snapshot here, mirroring the old per-entity smoothing.
 *
 * The floating integrity bars stay per-entity in `DestructibleEntity` (only a
 * damaged drum shows one); this component owns just the bodies.
 */

const MAX_DRUMS = 128;
/** Smoothing rate (matches DestructibleEntity so the bar tracks the body). */
const SMOOTH_RATE = 18;

const _tgtPos = new Vector3();
const _tgtQuat = new Quaternion();
const _ONE = new Vector3(1, 1, 1);

export function InstancedDrums() {
  const glass = useThree((s) => glassMaterialFor(s.gl));
  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const smooth = useRef(new Map<string, { pos: Vector3; quat: Quaternion }>());
  const mat = useRef(new Matrix4());
  const off = useRef(new Matrix4());

  // The drum model's merged groups (one set, shared by every instance).
  const groups = useMemo(() => {
    const prop = assets.getProp('prop.arena.drum');
    if (!prop || prop.render.kind !== 'placeholder') return [];
    return getMergedProp(prop.render).groups;
  }, []);

  useFrame((_, delta) => {
    const destructibles = useGameStore.getState().destructibles;
    const t = 1 - Math.exp(-SMOOTH_RATE * delta);
    const states = smooth.current;
    const seen = new Set<string>();
    let i = 0;
    destructibles.forEach((d, id) => {
      if (d.kind === 'tire' || i >= MAX_DRUMS) return;
      seen.add(id);
      let s = states.get(id);
      if (!s) {
        s = { pos: new Vector3(d.x, d.y, d.z), quat: new Quaternion(d.qx, d.qy, d.qz, d.qw) };
        states.set(id, s);
      }
      s.pos.lerp(_tgtPos.set(d.x, d.y, d.z), t);
      s.quat.slerp(_tgtQuat.set(d.qx, d.qy, d.qz, d.qw), t);
      // Body world = (smoothed pos+tumble) then the model's −halfHeight offset (so
      // it pivots about its middle), matching DestructibleEntity's nested groups.
      mat.current.compose(s.pos, s.quat, _ONE);
      off.current.makeTranslation(0, -d.sy, 0);
      mat.current.multiply(off.current);
      for (const m of meshes.current) if (m) m.setMatrixAt(i, mat.current);
      i++;
    });
    const count = i;
    for (const m of meshes.current) {
      if (!m) continue;
      m.count = count;
      m.instanceMatrix.needsUpdate = true;
    }
    // Drop smoothing state for drums that despawned, so the map can't grow forever.
    if (states.size > count) {
      for (const id of states.keys()) if (!seen.has(id)) states.delete(id);
    }
  });

  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((g, gi) => (
        <instancedMesh
          key={g.key}
          ref={(el) => (meshes.current[gi] = el)}
          args={[g.geometry, undefined, MAX_DRUMS]}
          castShadow={g.castShadow}
          receiveShadow={g.receiveShadow}
          // The batch spans the whole arena; don't let its combined bounds cull it.
          frustumCulled={false}
        >
          <MergedGroupMaterial group={g} glass={glass} />
        </instancedMesh>
      ))}
    </>
  );
}
