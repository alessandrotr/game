import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Mesh, MeshBasicMaterial } from 'three';
import { useGameStore } from '../store/useGameStore';

/** Create a canvas-based high-quality flat texture for the traps' center icons. */
function createTrapIconTexture(kind: 'heal' | 'death' | 'singularity' | 'buff'): CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  if (kind === 'heal') {
    // Green Cross
    ctx.fillStyle = '#22c55e';
    ctx.shadowColor = 'rgba(34, 197, 94, 0.9)';
    ctx.shadowBlur = 18;

    const thickness = 52;
    const length = 170;
    const center = 128;

    // Horizontal bar
    ctx.fillRect(center - length / 2, center - thickness / 2, length, thickness);
    // Vertical bar
    ctx.fillRect(center - thickness / 2, center - length / 2, thickness, length);
  } else if (kind === 'death') {
    // Stylized Flame
    ctx.fillStyle = '#ff5a1f'; // Orange base
    ctx.shadowColor = 'rgba(255, 90, 31, 0.9)';
    ctx.shadowBlur = 22;

    ctx.beginPath();
    ctx.moveTo(128, 220);
    // Left outer curve
    ctx.bezierCurveTo(60, 200, 60, 120, 110, 70);
    // Left inner tip dip
    ctx.bezierCurveTo(100, 100, 115, 120, 128, 100);
    // Center high tip
    ctx.bezierCurveTo(135, 60, 140, 30, 150, 40);
    // Right outer curve
    ctx.bezierCurveTo(190, 100, 190, 180, 128, 220);
    ctx.closePath();
    ctx.fill();

    // Inner bright yellow flame core
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffea00';
    ctx.beginPath();
    ctx.moveTo(128, 200);
    // Left outer curve (scaled down/inner)
    ctx.bezierCurveTo(80, 185, 80, 135, 115, 105);
    // Left inner tip dip
    ctx.bezierCurveTo(110, 120, 120, 130, 128, 120);
    // Center high tip
    ctx.bezierCurveTo(132, 95, 136, 75, 142, 80);
    // Right outer curve
    ctx.bezierCurveTo(170, 120, 170, 170, 128, 200);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'singularity') {
    // Solid black center sphere
    ctx.fillStyle = '#000000';
    ctx.shadowColor = 'rgba(139, 92, 246, 0.9)'; // Purple glow
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(128, 128, 50, 0, Math.PI * 2);
    ctx.fill();

    // Dark purple swirling arms
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#6d28d9';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    
    // Draw 3 spiral arms
    for (let j = 0; j < 3; j++) {
      ctx.beginPath();
      const offset = (j * Math.PI * 2) / 3;
      for (let theta = 0; theta < Math.PI * 1.5; theta += 0.1) {
        const r = 50 + theta * 18;
        const xVal = 128 + Math.cos(theta + offset) * r;
        const yVal = 128 + Math.sin(theta + offset) * r;
        if (theta === 0) ctx.moveTo(xVal, yVal);
        else ctx.lineTo(xVal, yVal);
      }
      ctx.stroke();
    }
  } else if (kind === 'buff') {
    // Glowing cyan center circle
    ctx.fillStyle = '#06b6d4';
    ctx.shadowColor = 'rgba(34, 211, 238, 0.9)'; // Cyan glow
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(128, 128, 45, 0, Math.PI * 2);
    ctx.fill();

    // Lightning bolt in gold / yellow overlay
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(135, 45);   // top right
    ctx.lineTo(100, 125);  // middle left
    ctx.lineTo(125, 125);  // middle right shift
    ctx.lineTo(115, 205);  // bottom tip
    ctx.lineTo(155, 115);  // middle right
    ctx.lineTo(130, 115);  // middle left shift
    ctx.closePath();
    ctx.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const iconTextures = {
  heal: typeof document !== 'undefined' ? createTrapIconTexture('heal') : null,
  death: typeof document !== 'undefined' ? createTrapIconTexture('death') : null,
  singularity: typeof document !== 'undefined' ? createTrapIconTexture('singularity') : null,
  buff: typeof document !== 'undefined' ? createTrapIconTexture('buff') : null,
};

/** Per-kind palette. Heal reads green / medical / safe; death reads red-orange /
 *  burning / dangerous — so the ring alone tells you what the trap does. */
const STYLE = {
  heal: { main: '#22c55e', fill: '#16a34a', charge: '#4ade80' },
  death: { main: '#ff5a1f', fill: '#b91c1c', charge: '#ffea00' },
  singularity: { main: '#5b21b6', fill: '#2e1065', charge: '#a78bfa' },
  buff: { main: '#0891b2', fill: '#083344', charge: '#22d3ee' },
} as const;

function styleFor(kind: string) {
  return STYLE[kind as keyof typeof STYLE] ?? STYLE.heal;
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
 * It also displays the charging ring and the custom center icon on armed traps:
 *  - Fills up clockwise when zombies are killed in range before activation.
 *  - Pulses rapidly as it charges and nears activation.
 *
 * The server owns activation + cooldown; `cooldownProgress` (0→1) and `chargeProgress` (0→1)
 * drive the arcs. The visual unmounts when the trap leaves state.
 */
function TrapEntity({ id }: { id: string }) {
  const initial = useGameStore.getState().traps.get(id);
  const fillMat = useRef<MeshBasicMaterial>(null);
  const border = useRef<Mesh>(null);
  const borderMat = useRef<MeshBasicMaterial>(null);
  const chargeBorder = useRef<Mesh>(null);
  const chargeBorderMat = useRef<MeshBasicMaterial>(null);
  const iconMat = useRef<MeshBasicMaterial>(null);

  useFrame((state) => {
    const t = useGameStore.getState().traps.get(id);
    if (!t) return;
    const p = Math.max(0, Math.min(1, t.cooldownProgress));
    const cp = Math.max(0, Math.min(1, t.chargeProgress ?? 0));
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

    // The charging border: reveal `cp` of it.
    if (chargeBorder.current) {
      const seg = Math.round(cp * BORDER_SEG);
      chargeBorder.current.geometry.setDrawRange(0, seg * 6);
      chargeBorder.current.visible = seg > 0 && ready;
    }
    if (chargeBorderMat.current) {
      // Rapid neon pulse when charging, otherwise invisible.
      if (ready && cp > 0) {
        chargeBorderMat.current.opacity = 0.85 + Math.sin(tEl * 12) * 0.15;
      } else {
        chargeBorderMat.current.opacity = 0;
      }
    }

    // The area fill brightens and pulses faster in direct proportion to charge.
    if (fillMat.current) {
      if (ready) {
        if (cp > 0) {
          // Intense pulsing glow while charging
          fillMat.current.opacity = 0.15 + cp * 0.25 + Math.sin(tEl * (5 + cp * 10)) * (0.02 + cp * 0.05);
        } else {
          // Standard soft pulse when armed
          fillMat.current.opacity = 0.2 + Math.sin(tEl * 3) * 0.04;
        }
      } else {
        // Recharging cooldown: dim fill
        fillMat.current.opacity = 0.12;
      }
    }

    // Gentle floating/pulsing opacity for the icon
    if (iconMat.current) {
      iconMat.current.opacity = 0.45 + Math.sin(tEl * 2.5) * 0.1 + cp * 0.35;
    }
  });

  if (!initial) return null;
  const s = styleFor(initial.kind);
  const r = initial.radius;
  const kindKey = (initial.kind as keyof typeof iconTextures) || 'heal';

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

      {/* The charging border — draw range = chargeProgress, slightly thicker. */}
      <mesh ref={chargeBorder} position={[0, 0.062, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r - 0.42, r + 0.05, BORDER_SEG, 1, Math.PI / 2, Math.PI * 2]} />
        <meshBasicMaterial ref={chargeBorderMat} color={s.charge} transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Center Flat Icon Plane */}
      {iconTextures[kindKey] && (
        <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[r * 1.4, r * 1.4]} />
          <meshBasicMaterial
            ref={iconMat}
            map={iconTextures[kindKey]!}
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </mesh>
      )}
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

