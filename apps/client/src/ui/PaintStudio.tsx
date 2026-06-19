import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Vector3, type Mesh } from 'three';
import { Brush, Eraser, Pipette, FlipHorizontal2, Undo2, Redo2, Trash2, Droplet } from 'lucide-react';
import type { CharacterClass } from '@arena/shared';
import { resolveCharacter } from '../assets/CharacterFactory';
import { CharacterModel } from '../render/CharacterModel';
import { getPaintSurface, paintTexturesFor, type PaintPart } from '../paint/paintSurface';
import { usePaintStore } from '../store/usePaintStore';
import { IconButton } from './primitives/icon-button';
import { Slider } from './primitives/slider';
import { Card } from './primitives/card';

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

/** A sphere that tracks the hovered surface point, previewing where and how big
 *  the next stamp will be. Solid in the paint color for the brush; a hollow ring
 *  for the eraser (reads as "remove"); hidden for the eyedropper (no footprint).
 *  With `mirror`, a second sphere previews the reflected stamp across local x=0. */
function BrushTip({
  hover,
  color,
  radius,
  tool,
  mirror,
}: {
  hover: React.MutableRefObject<Hover>;
  color: string;
  radius: number;
  tool: 'brush' | 'eraser' | 'eyedropper';
  mirror: boolean;
}) {
  const ref = useRef<Mesh>(null);
  const mref = useRef<Mesh>(null);
  const show = tool !== 'eyedropper';
  useFrame(() => {
    const m = ref.current;
    if (m) {
      m.visible = show && hover.current.visible;
      m.position.set(hover.current.x, hover.current.y, hover.current.z);
    }
    const mm = mref.current;
    if (mm) {
      mm.visible = show && mirror && hover.current.visible;
      mm.position.set(-hover.current.x, hover.current.y, hover.current.z);
    }
  });
  const erasing = tool === 'eraser';
  return (
    <>
      <mesh ref={ref} visible={false} raycast={() => null}>
        <sphereGeometry args={[radius, 16, 16]} />
        <meshBasicMaterial color={erasing ? '#ffffff' : color} transparent opacity={erasing ? 0.25 : 0.55} wireframe={erasing} depthTest={false} />
      </mesh>
      <mesh ref={mref} visible={false} raycast={() => null}>
        <sphereGeometry args={[radius, 16, 16]} />
        <meshBasicMaterial color={erasing ? '#ffffff' : color} transparent opacity={erasing ? 0.2 : 0.4} wireframe={erasing} depthTest={false} />
      </mesh>
    </>
  );
}

/**
 * Direct-on-model paint studio. Orbit the character (drag empty space) and edit
 * its body + head with the active tool: brush, eraser, or eyedropper, with an
 * optional mirror modifier. Head and body are independent surfaces, each with its
 * own skin color. Strokes mutate the class's shared PaintSurface textures, so paint
 * shows live here and on the in-world avatar.
 */
export function PaintStudio({ characterClass }: { characterClass: CharacterClass }) {
  const color = usePaintStore((s) => s.color);
  const brush = usePaintStore((s) => s.brush);
  const palette = usePaintStore((s) => s.palette);
  const recents = usePaintStore((s) => s.recents);
  const tool = usePaintStore((s) => s.tool);
  const mirror = usePaintStore((s) => s.mirror);
  const skinBody = usePaintStore((s) => s.skinFor(characterClass, 'body'));
  const skinHead = usePaintStore((s) => s.skinFor(characterClass, 'head'));
  const canUndo = usePaintStore((s) => s.canUndo(characterClass));
  const canRedo = usePaintStore((s) => s.canRedo(characterClass));
  const setColor = usePaintStore((s) => s.setColor);
  const setBrush = usePaintStore((s) => s.setBrush);
  const setTool = usePaintStore((s) => s.setTool);
  const toggleMirror = usePaintStore((s) => s.toggleMirror);
  const setSkin = usePaintStore((s) => s.setSkin);
  const undo = usePaintStore((s) => s.undo);
  const redo = usePaintStore((s) => s.redo);
  const clear = usePaintStore((s) => s.clear);
  const markPainted = usePaintStore((s) => s.markPainted);

  const descriptor = resolveCharacter(characterClass);
  const paint = paintTexturesFor(characterClass);

  // Refs read inside r3f pointer handlers (captured once) — kept current so the
  // latest color/brush/tool/mirror apply without re-binding handlers.
  const colorRef = useRef(color);
  colorRef.current = color;
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;
  const painting = useRef(false);
  const activePart = useRef<PaintPart | null>(null);
  /** Previous stroke point in the active mesh's LOCAL space (for segment fill). */
  const prevLocal = useRef<Vector3 | null>(null);
  const hover = useRef<Hover>({ visible: false, x: 0, y: 0, z: 0 });
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [skinOpen, setSkinOpen] = useState(false);

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

  // Undo / redo via the platform shortcut (studio is mounted only on the Paint tab).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo(characterClass);
      else undo(characterClass);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [characterClass, undo, redo]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || !isPaintPart(e.object.name)) return; // left only; orbit otherwise
    e.stopPropagation();
    const part = e.object.name;
    // Eyedropper: sample the composite at the hit UV into the active color, no stroke.
    if (toolRef.current === 'eyedropper') {
      if (e.uv) setColor(getPaintSurface(characterClass, part).sampleAt(e.uv.x, e.uv.y));
      return;
    }
    painting.current = true;
    activePart.current = part;
    setOrbitEnabled(false);
    const surface = getPaintSurface(characterClass, part);
    surface.ensurePositionMap((e.object as Mesh).geometry);
    surface.beginStroke();
    // World hit → the mesh's local space (matches the position map).
    const local = e.object.worldToLocal(_localA.copy(e.point));
    const mode = toolRef.current === 'eraser' ? 'erase' : 'paint';
    surface.stampWorld(local, local, brushWorld(brushRef.current), colorRef.current, mode, mirrorRef.current);
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
    const mode = toolRef.current === 'eraser' ? 'erase' : 'paint';
    getPaintSurface(characterClass, activePart.current).stampWorld(
      from,
      local,
      brushWorld(brushRef.current),
      colorRef.current,
      mode,
      mirrorRef.current,
    );
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
        <BrushTip hover={hover} color={color} radius={brushWorld(brush)} tool={tool} mirror={mirror} />
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

      {/* Tool rail — docked left over the canvas */}
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center p-4">
        <Card variant="hud" className="pointer-events-auto flex max-h-full w-44 flex-col gap-3 overflow-y-auto p-3">
          {/* Tools */}
          <div className="grid grid-cols-3 gap-1.5">
            <ToolButton icon={Brush} label="Brush" active={tool === 'brush'} onClick={() => setTool('brush')} />
            <ToolButton icon={Eraser} label="Eraser" active={tool === 'eraser'} onClick={() => setTool('eraser')} />
            <ToolButton icon={Pipette} label="Eyedropper" active={tool === 'eyedropper'} onClick={() => setTool('eyedropper')} />
          </div>
          <ToolButton icon={FlipHorizontal2} label="Mirror" active={mirror} onClick={toggleMirror} wide />

          <Divider />

          {/* Active color */}
          <Section label="Color">
            <div className="flex items-center gap-2">
              <ColorInput value={color} onChange={setColor} className="h-9 w-9" />
              <span className="font-mono text-xs uppercase text-muted">{color}</span>
            </div>
          </Section>

          {recents.length > 0 && (
            <Section label="Recent">
              <div className="flex flex-wrap gap-1.5">
                {recents.map((c) => (
                  <Swatch key={`r-${c}`} color={c} active={color.toLowerCase() === c.toLowerCase()} onClick={() => setColor(c)} />
                ))}
              </div>
            </Section>
          )}

          <Section label="Palette">
            <div className="flex flex-wrap gap-1.5">
              {palette.map((c) => (
                <Swatch key={c} color={c} active={color.toLowerCase() === c.toLowerCase()} onClick={() => setColor(c)} />
              ))}
            </div>
          </Section>

          <Divider />

          {/* Brush size */}
          <Section label={`Size · ${brush}`}>
            <Slider min={1} max={32} step={1} value={brush} onValueChange={setBrush} aria-label="Brush size" />
          </Section>

          <Divider />

          {/* Actions */}
          <div className="relative flex items-center gap-1">
            <IconButton icon={Undo2} aria-label="Undo" disabled={!canUndo} onClick={() => undo(characterClass)} />
            <IconButton icon={Redo2} aria-label="Redo" disabled={!canRedo} onClick={() => redo(characterClass)} />
            <span className="mx-0.5 h-5 w-px bg-white/10" />
            <IconButton
              icon={Droplet}
              aria-label="Skin colors"
              aria-expanded={skinOpen}
              className={skinOpen ? 'text-gold' : undefined}
              onClick={() => setSkinOpen((v) => !v)}
            />
            <IconButton
              icon={Trash2}
              aria-label="Clear paint"
              className="ml-auto"
              onClick={() => {
                clear(characterClass, 'body');
                clear(characterClass, 'head');
              }}
            />

            {skinOpen && (
              <Card variant="inset" className="absolute bottom-full left-0 z-popover mb-2 flex w-40 flex-col gap-2 p-3!">
                <p className="text-[11px] uppercase tracking-wide text-muted">Skin base color</p>
                <SkinRow label="Head" value={skinHead} onChange={(c) => setSkin(characterClass, 'head', c)} />
                <SkinRow label="Body" value={skinBody} onChange={(c) => setSkin(characterClass, 'body', c)} />
              </Card>
            )}
          </div>
        </Card>
      </div>

      <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted">
        Drag on the body to {tool === 'eraser' ? 'erase' : tool === 'eyedropper' ? 'sample colors' : 'paint'} · drag empty space to rotate · ⌘/Ctrl+Z to undo
      </p>
    </div>
  );
}

/** A tool / toggle button: icon-only by default, full-width with a label when `wide`. */
function ToolButton({
  icon: Icon,
  label,
  active,
  onClick,
  wide,
}: {
  icon: typeof Brush;
  label: string;
  active: boolean;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-9 items-center justify-center gap-2 rounded-lg border transition ${
        active ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/5 text-text hover:bg-white/10'
      }`}
    >
      <Icon size={17} aria-hidden />
      {wide && <span className="text-xs">{label}</span>}
    </button>
  );
}

/** A labeled control group with a small caption. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <span className="h-px w-full bg-white/10" />;
}

/** A round quick-select color swatch (palette + recents). */
function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Color ${color}`}
      onClick={onClick}
      className={`h-6 w-6 rounded-full border-2 transition ${active ? 'scale-110 border-gold' : 'border-white/20'}`}
      style={{ backgroundColor: color }}
    />
  );
}

/** A round swatch wrapping a native color input. */
function ColorInput({ value, onChange, className }: { value: string; onChange: (c: string) => void; className?: string }) {
  return (
    <span className={`relative cursor-pointer overflow-hidden rounded-full border-2 border-white/20 ${className ?? 'h-7 w-7'}`} style={{ backgroundColor: value }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Pick color"
      />
    </span>
  );
}

/** A labeled skin-color row in the skin popover. */
function SkinRow({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <label className="flex items-center justify-between text-xs text-text" title={`${label} skin color`}>
      {label}
      <ColorInput value={value} onChange={onChange} />
    </label>
  );
}
