import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { CLASS_LIST, classCosmeticsOf, type CharacterClass } from '@arena/shared';
import { resolveCharacter, resolveEnchant } from '../assets/CharacterFactory';
import { useCosmeticsStore } from '../store/useCosmeticsStore';
import { usePaintStore } from '../store/usePaintStore';
import { paintTexturesFor } from '../paint/paintSurface';
import { CharacterModel } from './CharacterModel';
import { EnchantClock } from './enchantMaterial';

/**
 * Renders a headshot of every playable class from a **single** offscreen WebGL
 * context (one hidden R3F `<Canvas>`), blitting each into a per-tile 2D
 * `<canvas>`. Mirrors {@link ./pedestalThumbnails} and {@link ./emoteThumbnails}:
 * one `<Canvas>` per tile would spend a WebGL context each and blow past the
 * browser's ~16-context cap; here every roster face costs one context total.
 *
 * The shared scene holds all class models at once (each invisible by default).
 * Each frame the driver shows only the class a dirty tile needs, renders, and
 * `drawImage`s the result into that tile's canvas. The camera is framed tight on
 * the head/shoulders so the tile reads as a portrait. Tiles are static (no
 * animation), so once every tile has settled its frame the loop does zero GPU
 * work until a new tile registers.
 */

export interface CharacterThumbHandle {
  /** The tile's own 2D canvas to blit into. */
  canvas: HTMLCanvasElement;
  /** Which class face to render into it. */
  characterClass: CharacterClass;
}

/** Live model groups by class, populated as each class group mounts. */
const groups = new Map<CharacterClass, Group>();
const thumbs = new Set<CharacterThumbHandle>();
/** Tiles needing a (re)render → frames still to draw. Several frames (not one)
 *  because the GLB loads async and a freshly-created context can hand back a
 *  blank first frame. */
const dirty = new Map<CharacterThumbHandle, number>();
/** How many frames to settle on register / model-ready (covers async load). */
const STATIC_FRAMES = 24;

/** Re-settle every registered tile of a given class (its model just mounted). */
function markClassDirty(cls: CharacterClass): void {
  for (const t of thumbs) if (t.characterClass === cls) dirty.set(t, STATIC_FRAMES);
}

/** Start driving a tile (settles a static head frame). Returns an unregister fn. */
export function registerCharacterThumb(handle: CharacterThumbHandle): () => void {
  thumbs.add(handle);
  dirty.set(handle, STATIC_FRAMES);
  return () => {
    thumbs.delete(handle);
    dirty.delete(handle);
  };
}

/** Blit the shared (square) buffer into a tile's 2D canvas, aspect-preserved and
 *  centered ("contain"). Tiles are square like the buffer, so this fills them.
 *  Returns false if the destination isn't laid out yet (retry next frame). */
function blitContain(src: HTMLCanvasElement, dst: HTMLCanvasElement): boolean {
  const cw = dst.clientWidth;
  const ch = dst.clientHeight;
  if (cw === 0 || ch === 0) return false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(cw * dpr);
  const h = Math.round(ch * dpr);
  if (dst.width !== w) dst.width = w;
  if (dst.height !== h) dst.height = h;
  const ctx = dst.getContext('2d');
  if (!ctx) return false;
  ctx.clearRect(0, 0, w, h);
  const scale = Math.min(w / src.width, h / src.height);
  const dw = src.width * scale;
  const dh = src.height * scale;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return true;
}

/** One class's model in its equipped look, parked at the origin and hidden until
 *  a tile asks for it. */
function ClassModel({
  cls,
  skinId,
  dyeId,
  weaponId,
  enchantId,
}: {
  cls: CharacterClass;
  skinId?: string;
  dyeId?: string;
  weaponId?: string;
  enchantId?: string;
}) {
  const ref = useRef<Group>(null);
  const descriptor = useMemo(
    () => resolveCharacter(cls, skinId, dyeId, weaponId),
    [cls, skinId, dyeId, weaponId],
  );
  const enchant = useMemo(() => resolveEnchant(enchantId), [enchantId]);
  // The player's custom paint for this class, when they've painted it.
  const painted = usePaintStore((s) => !!s.customizedByClass[cls]);
  const paint = useMemo(() => (painted ? paintTexturesFor(cls) : undefined), [cls, painted]);
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.visible = false;
    groups.set(cls, g);
    return () => {
      groups.delete(cls);
    };
  }, [cls]);
  // (Re)settle this class's tiles whenever its model is (re)built — on mount and
  // on any equipped-cosmetic, enchant, or paint change.
  useEffect(() => {
    markClassDirty(cls);
  }, [cls, descriptor, enchant, paint]);
  return (
    <group ref={ref}>
      <CharacterModel descriptor={descriptor} paint={paint} enchant={enchant} />
    </group>
  );
}

/** Each frame, render every dirty tile: show only its class, render once, blit.
 *  No-ops entirely when nothing is dirty. Manual render (priority 1). */
function StageDriver() {
  useFrame(({ gl, scene, camera }) => {
    if (dirty.size === 0) return;
    for (const [thumb, left] of dirty) {
      const g = groups.get(thumb.characterClass);
      if (!g) continue; // model not mounted yet — keep it dirty, retry next frame
      // Solo this class for the render.
      for (const [cls, other] of groups) other.visible = cls === thumb.characterClass;
      gl.render(scene, camera);
      if (blitContain(gl.domElement, thumb.canvas)) {
        if (left <= 1) dirty.delete(thumb);
        else dirty.set(thumb, left - 1);
      }
    }
  }, 1);
  return null;
}

/**
 * Mount once where the roster faces are shown (the character select). A single
 * hidden canvas; tiles register their own 2D canvas via
 * {@link registerCharacterThumb}.
 */
export function CharacterThumbStage() {
  const byClass = useCosmeticsStore((s) => s.byClass);
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 256,
        height: 256,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 1.55, 2.55], fov: 25 }}
        onCreated={({ camera }) => camera.lookAt(0, 1.5, 0)}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      >
        <EnchantClock />
        <ambientLight intensity={0.95} />
        <directionalLight position={[2, 4, 3]} intensity={1.3} color="#fff1d4" />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#8ea8ff" />
        {CLASS_LIST.map((c) => {
          const { loadout } = classCosmeticsOf(byClass, c.id);
          return (
            <ClassModel
              key={c.id}
              cls={c.id}
              skinId={loadout.skinId}
              dyeId={loadout.dyeId}
              weaponId={loadout.weaponId}
              enchantId={loadout.enchantId}
            />
          );
        })}
        <StageDriver />
      </Canvas>
    </div>
  );
}
