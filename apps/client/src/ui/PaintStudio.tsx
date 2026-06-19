import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Vector3, type Mesh } from 'three';
import { Undo2, Trash2, Brush } from 'lucide-react';
import type { CharacterClass } from '@arena/shared';
import { resolveCharacter } from '../assets/CharacterFactory';
import { CharacterModel } from '../render/CharacterModel';
import { getPaintSurface, paintTexturesFor, type PaintPart } from '../paint/paintSurface';
import { usePaintStore } from '../store/usePaintStore';

/** Part names the brush is allowed to paint (the bare body surfaces). */
const PAINTABLE = new Set<PaintPart>(['body', 'head']);
const isPaintPart = (name: string): name is PaintPart => PAINTABLE.has(name as PaintPart);

/** Brush radius as a physical (world) size: the slider maps to a body fraction.
 *  Because painting is done in world space (see PaintSurface.stampWorld), this is
 *  the actual on-body footprint — uniform everywhere, regardless of UV stretch. */
const brushWorld = (slider: number) => slider * 0.004;

// Scratch vectors reused inside the pointer handlers (avoid per-move allocation).
const _localA = new Vector3();
const _localB = new Vector3();

/** Hover state shared with the in-canvas brush tip (mutated per pointer move,
 *  read each frame — kept off React state so moving the cursor is free). */
interface Hover {
  visible: boolean;
  x: number;
  y: number;
  z: number;
}

/** A translucent sphere that tracks the hovered surface point, previewing where
 *  and how big the next stamp will be, in the current paint color. */
function BrushTip({ hover, color, radius }: { hover: React.MutableRefObject<Hover>; color: string; radius: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    m.visible = hover.current.visible;
    m.position.set(hover.current.x, hover.current.y, hover.current.z);
  });
  return (
    <mesh ref={ref} visible={false} raycast={() => null}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} depthTest={false} />
    </mesh>
  );
}

/**
 * Direct-on-model paint tool: orbit the character (drag empty space) and brush
 * color onto its body + head (drag on the model). Head and body are independent
 * surfaces, so each has its own skin color. Strokes mutate the class's shared
 * PaintSurface textures, so paint shows live here and on the in-world avatar.
 */
export function PaintStudio({ characterClass }: { characterClass: CharacterClass }) {
  const color = usePaintStore((s) => s.color);
  const brush = usePaintStore((s) => s.brush);
  const palette = usePaintStore((s) => s.palette);
  const skinBody = usePaintStore((s) => s.skinFor(characterClass, 'body'));
  const skinHead = usePaintStore((s) => s.skinFor(characterClass, 'head'));
  const setColor = usePaintStore((s) => s.setColor);
  const setBrush = usePaintStore((s) => s.setBrush);
  const setSkin = usePaintStore((s) => s.setSkin);
  const undo = usePaintStore((s) => s.undo);
  const clear = usePaintStore((s) => s.clear);
  const markPainted = usePaintStore((s) => s.markPainted);

  const descriptor = resolveCharacter(characterClass);
  const paint = paintTexturesFor(characterClass);

  // Refs read inside r3f pointer handlers (captured once) — kept current so the
  // latest color/brush apply without re-binding handlers.
  const colorRef = useRef(color);
  colorRef.current = color;
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const painting = useRef(false);
  const activePart = useRef<PaintPart | null>(null);
  /** Most recent part touched by a stroke — the target for Undo. */
  const lastPart = useRef<PaintPart>('body');
  /** Previous stroke point in the active mesh's LOCAL space (for segment fill). */
  const prevLocal = useRef<Vector3 | null>(null);
  const hover = useRef<Hover>({ visible: false, x: 0, y: 0, z: 0 });
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  // Load this class's saved skin + paint onto its surfaces when the studio opens.
  useEffect(() => {
    void usePaintStore.getState().hydrate(characterClass);
  }, [characterClass]);

  // End a stroke even if the pointer is released off the model / off-canvas.
  useEffect(() => {
    const end = () => {
      if (!painting.current) return;
      const part = activePart.current;
      painting.current = false;
      activePart.current = null;
      prevLocal.current = null;
      setOrbitEnabled(true);
      if (part) markPainted(characterClass, part);
    };
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, [characterClass, markPainted]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || !isPaintPart(e.object.name)) return; // left only; orbit otherwise
    e.stopPropagation();
    const part = e.object.name;
    painting.current = true;
    activePart.current = part;
    lastPart.current = part;
    setOrbitEnabled(false);
    const surface = getPaintSurface(characterClass, part);
    surface.ensurePositionMap((e.object as Mesh).geometry);
    surface.beginStroke();
    // World hit → the mesh's local space (matches the position map).
    const local = e.object.worldToLocal(_localA.copy(e.point));
    surface.stampWorld(local, local, brushWorld(brushRef.current), colorRef.current);
    prevLocal.current = local.clone();
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    // Track the hovered surface point for the brush-tip preview.
    if (isPaintPart(e.object.name)) {
      hover.current.visible = true;
      hover.current.x = e.point.x;
      hover.current.y = e.point.y;
      hover.current.z = e.point.z;
    } else {
      hover.current.visible = false;
    }
    if (!painting.current || !activePart.current || e.object.name !== activePart.current) return;
    e.stopPropagation();
    const local = e.object.worldToLocal(_localB.copy(e.point));
    const from = prevLocal.current ?? local;
    getPaintSurface(characterClass, activePart.current).stampWorld(from, local, brushWorld(brushRef.current), colorRef.current);
    prevLocal.current = local.clone();
  };

  const onPointerLeave = () => {
    hover.current.visible = false;
  };

  return (
    <div className="relative h-full w-full">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.4, 5.4], fov: 42 }}>
        <color attach="background" args={['#0a0b12']} />
        <ambientLight intensity={0.9} color="#ffffff" />
        <directionalLight position={[3, 5, 2]} intensity={1.5} color="#ffffff" castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-4, 2, -3]} intensity={0.4} color="#cfd8ff" />

        <group onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
          <CharacterModel descriptor={descriptor} paint={paint} animate={false} />
        </group>
        <BrushTip hover={hover} color={color} radius={brushWorld(brush)} />
        <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={6} blur={2.4} far={4} />

        <OrbitControls
          makeDefault
          enabled={orbitEnabled}
          target={[0, 1.0, 0]}
          enablePan={false}
          enableDamping
          minDistance={2.4}
          maxDistance={7}
          minPolarAngle={0.25}
          maxPolarAngle={Math.PI / 2 - 0.04}
        />
      </Canvas>

      {/* Toolbar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 p-4">
        <div className="pointer-events-auto mx-auto flex max-w-full flex-wrap items-center gap-2 rounded-2xl bg-black/55 px-3 py-2 backdrop-blur">
          <ColorPick label="Head" value={skinHead} onChange={(c) => setSkin(characterClass, 'head', c)} />
          <ColorPick label="Body" value={skinBody} onChange={(c) => setSkin(characterClass, 'body', c)} />
          <ColorPick label="Paint" value={color} onChange={setColor} />
          <span className="mx-0.5 h-6 w-px bg-white/15" />
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full border-2 transition ${
                color.toLowerCase() === c.toLowerCase() ? 'scale-110 border-gold' : 'border-white/20'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}

          <div className="mx-1 flex items-center gap-2 text-muted">
            <Brush size={15} aria-hidden />
            <input
              type="range"
              min={1}
              max={32}
              value={brush}
              onChange={(e) => setBrush(Number(e.target.value))}
              className="w-24 accent-gold"
              aria-label="Brush size"
            />
          </div>

          <button
            type="button"
            onClick={() => undo(characterClass, lastPart.current)}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm text-text transition hover:bg-white/20"
          >
            <Undo2 size={15} aria-hidden /> Undo
          </button>
          <button
            type="button"
            onClick={() => {
              clear(characterClass, 'body');
              clear(characterClass, 'head');
            }}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm text-text transition hover:bg-white/20"
          >
            <Trash2 size={15} aria-hidden /> Clear
          </button>
        </div>
        <p className="pointer-events-none mx-auto text-center text-xs text-muted">
          Drag on the body to paint · drag empty space to rotate
        </p>
      </div>
    </div>
  );
}

/** A round color-picker swatch with a label, wrapping a native color input. */
function ColorPick({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted" title={`${label} color`}>
      {label}
      <span className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border-2 border-white/20" style={{ backgroundColor: value }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={`${label} color`}
        />
      </span>
    </label>
  );
}
