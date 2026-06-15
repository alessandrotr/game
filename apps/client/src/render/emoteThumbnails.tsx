import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { AnimationName, CharacterClass } from '@arena/shared';
import { resolveCharacter } from '../assets/CharacterFactory';
import { CharacterModel } from './CharacterModel';

/**
 * Renders every emote thumbnail from a **single** offscreen WebGL context (one
 * hidden R3F `<Canvas>`), blitting each frame into the per-card 2D `<canvas>`es.
 *
 * The naive approach — a `<Canvas>` per card — spends one WebGL context per
 * thumbnail and exhausts the browser's ~16-context cap once a real emote catalog
 * exists. This mirrors {@link ./pedestalThumbnails}: one context drives them all,
 * no matter how many emotes are on screen.
 *
 * Every emote card shows the *same* class character doing a *different* clip, and
 * only one card is hovered at a time, so the shared character plays the hovered
 * card's emote (idle when nothing is hovered). Each frame the buffer is blitted
 * into the active card; idle cards are settled to a still idle frame on register
 * / hover-end. The blit is "contain" (aspect-preserving, centered) so the model
 * sits centered in any card aspect.
 */

export interface EmoteThumbHandle {
  /** The card's own 2D canvas to blit into. */
  canvas: HTMLCanvasElement;
  /** The emote clip this card represents (played while the card is hovered). */
  anim: AnimationName;
}

const thumbs = new Set<EmoteThumbHandle>();
/** Thumbs needing a static (re)render → idle frames still to draw. A few frames
 *  (not one) because the GLB loads async and a crossfade settles over ~0.18s. */
const dirty = new Map<EmoteThumbHandle, number>();
/** How many idle frames to settle on register / hover-end (covers load + fade). */
const STATIC_FRAMES = 20;
/** The single hovered thumb whose emote the shared character is performing. */
let activeThumb: EmoteThumbHandle | null = null;

/** Logical animation the shared character should play this frame. */
function activeAnim(): AnimationName {
  return activeThumb?.anim ?? 'idle';
}

/** Start driving a thumbnail (settles a static idle frame; animates on hover).
 *  Returns an unregister fn (call on unmount). */
export function registerEmoteThumb(handle: EmoteThumbHandle): () => void {
  thumbs.add(handle);
  dirty.set(handle, STATIC_FRAMES);
  return () => {
    thumbs.delete(handle);
    dirty.delete(handle);
    if (activeThumb === handle) activeThumb = null;
  };
}

/** Toggle live animation for a thumbnail (on pointer enter/leave of its card). */
export function setEmoteThumbHover(handle: EmoteThumbHandle, on: boolean): void {
  if (on) {
    activeThumb = handle;
  } else {
    if (activeThumb === handle) activeThumb = null;
    dirty.set(handle, STATIC_FRAMES); // settle back to a clean idle frame
  }
}

/** Re-settle every thumbnail (e.g. the character class changed → remodel). */
function markAllDirty(): void {
  for (const t of thumbs) dirty.set(t, STATIC_FRAMES);
}

/** Blit the shared (square) buffer into a card's 2D canvas, aspect-preserved and
 *  centered ("contain"), so the model is centered whatever the card's shape.
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

/** Drives the shared scene: each frame renders the character (in its current
 *  animation) once and blits it to whichever cards need it. Skips all GPU work
 *  when nothing is hovered and nothing is dirty. Manual render (priority 1). */
function StageDriver() {
  useFrame(({ gl, scene, camera }) => {
    const active = activeThumb;
    if (!active && dirty.size === 0) return; // idle: no hover, nothing to settle
    gl.render(scene, camera);
    const src = gl.domElement;
    if (active) {
      // The hovered card animates: blit the live emote frame to it.
      blitContain(src, active.canvas);
    } else {
      // Character is idle: settle any dirty cards to a still idle frame.
      for (const [thumb, left] of dirty) {
        if (blitContain(src, thumb.canvas)) {
          if (left <= 1) dirty.delete(thumb);
          else dirty.set(thumb, left - 1);
        }
      }
    }
  }, 1);
  return null;
}

/**
 * Mount once where emote thumbnails are shown (e.g. the customize hub). A single
 * hidden canvas; cards register their own 2D canvas via {@link registerEmoteThumb}.
 * Remounts the character when the class changes and re-settles every thumbnail.
 */
export function EmoteThumbStage({ characterClass }: { characterClass: CharacterClass }) {
  const descriptor = useMemo(() => resolveCharacter(characterClass), [characterClass]);
  const getAnimation = useRef(activeAnim).current;

  // New class → new model: every card must re-capture its idle frame.
  useEffect(() => {
    markAllDirty();
  }, [characterClass]);

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
        camera={{ position: [0, 0.95, 4.0], fov: 34 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.95, 0)}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={0.95} />
        <directionalLight position={[2, 4, 3]} intensity={1.2} />
        <directionalLight position={[-3, 2, -2]} intensity={0.45} color="#9ab4ff" />
        <group key={characterClass}>
          <CharacterModel descriptor={descriptor} getAnimation={getAnimation} />
        </group>
        <StageDriver />
      </Canvas>
    </div>
  );
}
