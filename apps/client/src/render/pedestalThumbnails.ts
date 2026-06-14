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

function loop(now: number): void {
  if (!renderer) return;
  if (!startMs) startMs = now;
  const t = (now - startMs) / 1000;

  for (const thumb of thumbs) {
    const { canvas } = thumb;
    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) continue;

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
  }

  raf = requestAnimationFrame(loop);
}

/** Start driving a thumbnail. Returns an unregister fn (call on unmount). */
export function registerPedestalThumb(handle: PedestalThumbHandle): () => void {
  if (!renderer) init();
  thumbs.add(handle);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    thumbs.delete(handle);
    if (thumbs.size === 0 && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      startMs = 0;
    }
  };
}
