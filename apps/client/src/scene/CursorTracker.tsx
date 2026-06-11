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
  /** Canvas rect, cached — it only changes on resize, so we don't re-measure
   *  (a layout read + DOMRect allocation) every frame. */
  const rect = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const ndc = useRef(new Vector2());
  const ray = useRef(new Raycaster());
  const point = useRef(new Vector3());

  useEffect(() => {
    const measure = () => {
      const r = gl.domElement.getBoundingClientRect();
      rect.current = { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    measure();
    const onMove = (e: MouseEvent) => {
      screen.current.x = e.clientX;
      screen.current.y = e.clientY;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', measure);
    };
  }, [gl]);

  // Per-frame raycast is intentional: the follow-camera moves, so a still cursor
  // maps to a moving world point. Only the rect is cached, not the projection.
  useFrame(() => {
    const r = rect.current;
    if (r.width === 0 || r.height === 0) return;
    ndc.current.set(
      ((screen.current.x - r.left) / r.width) * 2 - 1,
      -(((screen.current.y - r.top) / r.height) * 2 - 1),
    );
    ray.current.setFromCamera(ndc.current, camera);
    if (ray.current.ray.intersectPlane(GROUND, point.current)) {
      setCursorGround(point.current.x, point.current.z);
    }
  });

  return null;
}
