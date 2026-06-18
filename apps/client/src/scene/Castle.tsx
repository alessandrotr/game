import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import { CASTLE } from '@arena/shared';
import { assets } from '../assets/registry';
import { mergePlaced, trsMatrix } from '../render/mergeGeometry';
import { MergedGroupMesh } from '../render/MergedGroupMesh';
import { getLocalRenderTransform } from '../store/localPlayer';

/**
 * The castle, rendered apart from the town map so it can react to the player.
 * Its parts are merged (a few draw calls, not ~70) but split into two regions —
 * the gate-side "front" (front wall, gate + corner towers, banners) and "rest".
 * When you step inside the courtyard the front region fades to a faint ghost
 * (not fully hidden) so the curtain wall between you and the camera no longer
 * blocks the view in but is still readable. Outside, it's fully solid again.
 */
const POS: [number, number, number] = [CASTLE.x, 0, CASTLE.z];
/** How visible the front region stays while you're inside (0 = invisible). */
const GHOST_OPACITY = 0.16;
/** Above this opacity the region renders as fully solid (opaque pass). */
const SOLID_THRESHOLD = 0.985;

export function Castle() {
  const frontRef = useRef<Group>(null);
  const fade = useRef(1); // current front-region opacity (1 = solid)

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

  useFrame((_, dt) => {
    const front = frontRef.current;
    if (!front) return;
    const t = getLocalRenderTransform();
    const inside =
      t.active &&
      Math.abs(t.x - CASTLE.x) <= CASTLE.halfX &&
      Math.abs(t.z - CASTLE.z) <= CASTLE.halfZ;

    // Smoothly drive the front region between solid and ghosted.
    fade.current = MathUtils.damp(fade.current, inside ? GHOST_OPACITY : 1, 9, dt);
    const opacity = fade.current;
    const transparent = opacity < SOLID_THRESHOLD;
    front.traverse((o) => {
      const mat = (o as Mesh).material as MeshStandardMaterial | undefined;
      // Only the standard wall/roof materials (skip the shared glass shader).
      if (!mat || !mat.isMeshStandardMaterial) return;
      if (mat.transparent !== transparent) {
        mat.transparent = transparent;
        mat.depthWrite = !transparent; // ghost shouldn't occlude the bailey behind it
        mat.needsUpdate = true;
      }
      mat.opacity = opacity;
    });
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
