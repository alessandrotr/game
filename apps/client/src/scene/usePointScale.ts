import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { PerspectiveCamera, ShaderMaterial } from 'three';

/** Pixel-size scale for world-space point sizes (diameter in world units → pixels). */
export function usePointScale(mat: React.RefObject<ShaderMaterial>) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const fov = (camera as PerspectiveCamera).fov ?? 55;
    const u = mat.current?.uniforms.uScale;
    if (u) u.value = (size.height * dpr) / (2 * Math.tan((fov * Math.PI) / 360));
  }, [size.height, dpr, camera, mat]);
}
