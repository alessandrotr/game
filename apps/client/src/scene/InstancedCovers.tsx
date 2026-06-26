import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Euler, type InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { assets } from '../assets/registry';
import { getMergedProp } from '../render/mergeGeometry';
import { MergedGroupMaterial } from '../render/MergedGroupMesh';
import { glassMaterialFor } from '../render/glassMaterial';
import { useGameStore } from '../store/useGameStore';

/**
 * Static cover structures (trailers/"houses", dumpsters) share a handful of
 * models, so every copy of a model is drawn together as one `InstancedMesh` per
 * merged group — a few draws for the whole field instead of a few per building.
 *
 * Cars are NOT instanced: they roll when shot and their wheels spin individually,
 * so they stay per-entity in `CoverStructureEntity`. The click-collider + HP bar
 * also stay per-entity (only this body geometry moves to the batch).
 */

const MAX_PER_MODEL = 64;
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _pos = new Vector3();
const _scl = new Vector3();

function isCar(assetId: string): boolean {
  return assetId.includes('car');
}

/** One model's worth of instanced cover bodies. */
function InstancedCoverModel({ assetId }: { assetId: string }) {
  const glass = useThree((s) => glassMaterialFor(s.gl));
  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const mat = useRef(new Matrix4());

  const groups = useMemo(() => {
    const prop = assets.getProp(assetId as `prop.${string}`);
    if (!prop || prop.render.kind !== 'placeholder') return [];
    return getMergedProp(prop.render).groups;
  }, [assetId]);

  useFrame(() => {
    const structures = useGameStore.getState().structures;
    let i = 0;
    structures.forEach((s) => {
      if (s.assetId !== assetId || i >= MAX_PER_MODEL) return;
      _e.set(0, s.rotation, 0);
      _q.setFromEuler(_e);
      _pos.set(s.x, 0, s.z);
      // Stretch the trailer along its length (X); squash flat (Y) when crumbled —
      // matching CoverStructureEntity's nested group scales.
      _scl.set(s.lengthScale || 1, s.destroyed ? 0.18 : 1, 1);
      mat.current.compose(_pos, _q, _scl);
      for (const m of meshes.current) if (m) m.setMatrixAt(i, mat.current);
      i++;
    });
    for (const m of meshes.current) {
      if (!m) continue;
      m.count = i;
      m.instanceMatrix.needsUpdate = true;
    }
  });

  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((g, gi) => (
        <instancedMesh
          key={g.key}
          ref={(el) => (meshes.current[gi] = el)}
          args={[g.geometry, undefined, MAX_PER_MODEL]}
          castShadow={g.castShadow}
          receiveShadow={g.receiveShadow}
          frustumCulled={false}
        >
          <MergedGroupMaterial group={g} glass={glass} />
        </instancedMesh>
      ))}
    </>
  );
}

export function InstancedCovers() {
  // Re-render only when the set of structures changes (spawn/crumble), then list
  // the distinct non-car models present so each gets one instanced batch.
  const structureIds = useGameStore((s) => s.structureIds);
  const assetIds = useMemo(() => {
    const structures = useGameStore.getState().structures;
    const set = new Set<string>();
    for (const id of structureIds) {
      const s = structures.get(id);
      if (s && !isCar(s.assetId)) set.add(s.assetId);
    }
    return [...set];
  }, [structureIds]);

  return (
    <>
      {assetIds.map((id) => (
        <InstancedCoverModel key={id} assetId={id} />
      ))}
    </>
  );
}
