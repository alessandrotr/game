import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { CASTLE } from '@arena/shared';
import { assets } from '../assets/registry';
import { mergePlaced, trsMatrix } from '../render/mergeGeometry';
import { MergedGroupMesh } from '../render/MergedGroupMesh';
import { getLocalRenderTransform } from '../store/localPlayer';

/**
 * The castle, rendered apart from the town map so it can react to the player.
 * Its parts are merged (a few draw calls, not ~70) but split into two regions —
 * the gate-side "front" (front wall, gate + corner towers, banners) and "rest".
 * When you step inside the courtyard the front region hides, so the curtain wall
 * between you and the camera no longer blocks the view in. Outside, all shows.
 */
const POS: [number, number, number] = [CASTLE.x, 0, CASTLE.z];

export function Castle() {
  const frontRef = useRef<Group>(null);

  const groups = useMemo(() => {
    const prop = assets.getProp('prop.castle');
    if (!prop || prop.render.kind !== 'placeholder') return [];
    const placed = prop.render.parts.map((part) => ({
      part,
      matrix: trsMatrix(part.position, part.rotation, part.scale),
    }));
    // "front" = anything on the gate (+z) side; that's what occludes the bailey.
    return mergePlaced(placed, (part) => ((part.position?.[2] ?? 0) > 0.5 ? 'front' : 'rest'));
  }, []);

  useEffect(() => () => groups.forEach((g) => g.geometry.dispose()), [groups]);

  useFrame(() => {
    const front = frontRef.current;
    if (!front) return;
    const t = getLocalRenderTransform();
    const inside =
      t.active &&
      Math.abs(t.x - CASTLE.x) <= CASTLE.halfX &&
      Math.abs(t.z - CASTLE.z) <= CASTLE.halfZ;
    front.visible = !inside;
  });

  return (
    <group position={POS}>
      <group ref={frontRef}>
        {groups
          .filter((g) => g.region === 'front')
          .map((g) => (
            <MergedGroupMesh key={g.key} group={g} />
          ))}
      </group>
      {groups
        .filter((g) => g.region !== 'front')
        .map((g) => (
          <MergedGroupMesh key={g.key} group={g} />
        ))}
    </group>
  );
}
