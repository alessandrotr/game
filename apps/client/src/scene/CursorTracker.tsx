import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { setCursorGround } from '../store/cursorState';

/** Ground plane (y = 0) the cursor is projected onto. */
const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Continuously projects the mouse cursor onto the ground plane and publishes the
 * point to `cursorState`. The follow-camera moves, so a stationary cursor maps
 * to a moving world point — hence the per-frame raycast. Feeds ability aiming.
 */
export function CursorTracker() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const screen = useRef({ x: 0, y: 0 });
  const ndc = useRef(new Vector2());
  const ray = useRef(new Raycaster());
  const point = useRef(new Vector3());

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      screen.current.x = e.clientX;
      screen.current.y = e.clientY;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useFrame(() => {
    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    ndc.current.set(
      ((screen.current.x - rect.left) / rect.width) * 2 - 1,
      -(((screen.current.y - rect.top) / rect.height) * 2 - 1),
    );
    ray.current.setFromCamera(ndc.current, camera);
    if (ray.current.ray.intersectPlane(GROUND, point.current)) {
      setCursorGround(point.current.x, point.current.z);
    }
  });

  return null;
}
