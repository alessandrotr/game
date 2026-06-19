import { type GroupProps } from '@react-three/fiber';

/**
 * Instantly shows/hides a scene subtree by toggling group visibility — no
 * transition. three skips invisible objects for rendering, lighting, AND
 * raycasting, so a hidden structure also stops casting its glow and can't be
 * clicked. Used to drop the town's non-focused structures (and the travel portals)
 * while one is cinematically focused (see useFocusStore).
 */
export function FadeGroup({ show, children, ...props }: { show: boolean } & GroupProps) {
  return (
    <group visible={show} {...props}>
      {children}
    </group>
  );
}
