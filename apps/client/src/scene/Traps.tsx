import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshBasicMaterial } from 'three';
import { useGameStore } from '../store/useGameStore';

/** Per-kind palette. Heal reads green / medical / safe; death reads red-orange /
 *  burning / dangerous — so the ring alone tells you what the trap does. */
const STYLE = {
  heal: { main: '#22c55e', fill: '#16a34a' },
  death: { main: '#ff5a1f', fill: '#b91c1c' },
} as const;

function styleFor(kind: string) {
  return kind === 'death' ? STYLE.death : STYLE.heal;
}

/** Segment count of the border ring (also its draw-range granularity). */
const BORDER_SEG = 120;

/**
 * A trap zone (zombie mode). Renders a flat fill sized EXACTLY to the trap's
 * radius (the area is the activation/effect zone), tinted by kind, with the
 * cooldown shown as the **border refilling around the perimeter**:
 *
 *  - Just fired → empty border (only a dim track), filling clockwise.
 *  - Recharging → the coloured border sweeps around in step with the cooldown.
 *  - Fully refilled → the whole border is lit and gently pulses (armed/ready).
 *
 * The server owns activation + cooldown; `cooldownProgress` (0→1) is exactly the
 * fraction of border drawn. The visual unmounts when the trap leaves state.
 */
function TrapEntity({ id }: { id: string }) {
  const initial = useGameStore.getState().traps.get(id);
  const fillMat = useRef<MeshBasicMaterial>(null);
  const border = useRef<Mesh>(null);
  const borderMat = useRef<MeshBasicMaterial>(null);

  useFrame((state) => {
    const t = useGameStore.getState().traps.get(id);
    if (!t) return;
    const p = Math.max(0, Math.min(1, t.cooldownProgress));
    const ready = p >= 0.999;
    const tEl = state.clock.elapsedTime;

    // The border IS the cooldown gauge: reveal `p` of it, clockwise from the top.
    if (border.current) {
      const seg = Math.round(p * BORDER_SEG);
      border.current.geometry.setDrawRange(0, seg * 6);
      border.current.visible = seg > 0;
    }
    // Lit border pulses softly once armed so "ready" is unmistakable.
    if (borderMat.current) {
      borderMat.current.opacity = ready ? 0.85 + Math.sin(tEl * 3) * 0.15 : 0.7;
    }
    // The area fill brightens a touch when armed (dim while charging).
    if (fillMat.current) {
      fillMat.current.opacity = ready ? 0.2 + Math.sin(tEl * 3) * 0.04 : 0.12;
    }
  });

  if (!initial) return null;
  const s = styleFor(initial.kind);
  const r = initial.radius;

  return (
    <group position={[initial.x, 0, initial.z]}>
      {/* Effect-area fill (sized to the trap radius). */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r, 48]} />
        <meshBasicMaterial ref={fillMat} color={s.fill} transparent opacity={0.12} depthWrite={false} />
      </mesh>

      {/* Dim full-circle track — the "empty" border the refill draws over. */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r - 0.35, r, BORDER_SEG, 1]} />
        <meshBasicMaterial color="#10141a" transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {/* The refilling border — draw range = cooldownProgress. */}
      <mesh ref={border} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r - 0.35, r, BORDER_SEG, 1, Math.PI / 2, Math.PI * 2]} />
        <meshBasicMaterial ref={borderMat} color={s.main} transparent opacity={0.7} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Renders every trap, mounting/unmounting as they appear/disappear. */
export function Traps() {
  const ids = useGameStore((s) => s.trapIds);
  return (
    <>
      {ids.map((id) => (
        <TrapEntity key={id} id={id} />
      ))}
    </>
  );
}
