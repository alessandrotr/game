import {
  AdditiveBlending,
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';
import type { PedestalEffect } from '@arena/shared';
import { PEDESTAL_FRAG, PEDESTAL_MODE, PEDESTAL_VERT } from './pedestalShader';

/**
 * Renders every store pedestal thumbnail from a **single** offscreen WebGL
 * context, blitting each into a per-card 2D `<canvas>`. The 2D canvases are real
 * DOM children of their cards, so they scroll with the grid and need no overlay
 * tracking — while only one WebGL context exists no matter how many thumbnails
 * are on screen (a `<Canvas>` per card would exhaust the browser's context cap).
 *
 * Each registered thumbnail supplies its own canvas + cosmetic; one shared RAF
 * loop renders the shared scene once per thumbnail (cheap — a single shader quad)
 * with that thumbnail's uniforms, then `drawImage`s the result into its canvas.
 */

export interface PedestalThumbHandle {
  canvas: HTMLCanvasElement;
  effect: PedestalEffect;
  color: string;
  color2?: string;
}

let renderer: WebGLRenderer | null = null;
let scene: Scene;
let camera: PerspectiveCamera;
/** Typed handles to the shared material's uniforms (avoids index-access typing). */
let uTime: { value: number };
let uMode: { value: number };
let uColor: { value: Color };
let uColor2: { value: Color };
const thumbs = new Set<PedestalThumbHandle>();
/** Thumbs needing a static (re)render → frames still to draw. A few frames (not
 *  one) because a freshly-created WebGL context can hand back a blank first frame. */
const dirty = new Map<PedestalThumbHandle, number>();
/** How many static frames to draw on register / hover-end. */
const STATIC_FRAMES = 4;
/** Thumbs currently hovered — these animate every frame. */
const hovered = new Set<PedestalThumbHandle>();
let raf = 0;
let startMs = 0;

function init(): void {
  renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);

  scene = new Scene();
  camera = new PerspectiveCamera(34, 1, 0.1, 100);
  // Pulled back so the disc sits in-frame with margin (not cropped by the card).
  camera.position.set(0, 3.5, 3.15);
  camera.lookAt(0, 0, 0);

  scene.add(new AmbientLight(0xffffff, 0.95));
  const dir = new DirectionalLight(0xffffff, 1.2);
  dir.position.set(2, 4, 3);
  scene.add(dir);

  uTime = { value: 0 };
  uMode = { value: 0 };
  uColor = { value: new Color() };
  uColor2 = { value: new Color() };
  const material = new ShaderMaterial({
    vertexShader: PEDESTAL_VERT,
    fragmentShader: PEDESTAL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uTime, uMode, uColor, uColor2 },
  });
  const mesh = new Mesh(new CircleGeometry(1.5, 96), material);
  mesh.rotation.x = -Math.PI / 2; // lay flat, viewed from the down-looking camera
  scene.add(mesh);
}

/** Render one thumbnail's current frame into its 2D canvas. Returns false if the
 *  canvas isn't laid out yet (so the caller can retry next frame). */
function renderThumb(thumb: PedestalThumbHandle, t: number): boolean {
  if (!renderer) return false;
  const { canvas } = thumb;
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return false;

  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  uTime.value = t;
  uMode.value = PEDESTAL_MODE[thumb.effect];
  uColor.value.set(thumb.color);
  uColor2.value.set(thumb.color2 ?? thumb.color);

  renderer.render(scene, camera);

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(renderer.domElement, 0, 0, w, h);
  }
  return true;
}

function ensureLoop(): void {
  if (!raf) raf = requestAnimationFrame(loop);
}

/**
 * Animate only the hovered thumbnails; everyone else just gets a one-off static
 * frame (queued in `dirty`). When nothing is hovered and nothing is dirty the
 * RAF stops entirely — zero idle GPU cost.
 */
function loop(now: number): void {
  if (!renderer) {
    raf = 0;
    return;
  }
  if (!startMs) startMs = now;
  const t = (now - startMs) / 1000;

  // Static (re)renders — only count a frame once the canvas is actually laid
  // out (renderThumb returns false at 0×0), so off-screen mounts still settle.
  for (const [thumb, left] of dirty) {
    if (renderThumb(thumb, t)) {
      if (left <= 1) dirty.delete(thumb);
      else dirty.set(thumb, left - 1);
    }
  }
  // Live animation for hovered thumbnails.
  for (const thumb of hovered) renderThumb(thumb, t);

  raf = dirty.size > 0 || hovered.size > 0 ? requestAnimationFrame(loop) : 0;
}

/** Start driving a thumbnail (renders a static frame; animates on hover).
 *  Returns an unregister fn (call on unmount). */
export function registerPedestalThumb(handle: PedestalThumbHandle): () => void {
  if (!renderer) init();
  thumbs.add(handle);
  dirty.set(handle, STATIC_FRAMES); // draw the initial static frame(s)
  ensureLoop();
  return () => {
    thumbs.delete(handle);
    dirty.delete(handle);
    hovered.delete(handle);
  };
}

/** Toggle live animation for a thumbnail (on pointer enter/leave of its card). */
export function setPedestalThumbHover(handle: PedestalThumbHandle, on: boolean): void {
  if (on) {
    hovered.add(handle);
  } else {
    hovered.delete(handle);
    dirty.set(handle, STATIC_FRAMES); // settle back to a clean static frame
  }
  ensureLoop();
}
