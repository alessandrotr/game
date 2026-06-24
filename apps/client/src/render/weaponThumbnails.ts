import {
  AmbientLight,
  Box3,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import type { EnchantEffect, PlaceholderPart } from '@arena/shared';
import { assets } from '../assets/registry';
import { enchantMaterialFor } from './enchantMaterial';

/**
 * Renders every store WEAPON / ENCHANT thumbnail from a single offscreen WebGL
 * context, blitting each into a per-card 2D `<canvas>` — the same pattern as
 * {@link ./pedestalThumbnails} (one context no matter how many tiles). Each thumb
 * supplies a weapon id (+ optional enchant); the shared loop swaps that weapon's
 * cached model into the scene, renders, and `drawImage`s the result.
 *
 * Enchant animation rides the shared `enchantTime` uniform (advanced by the
 * game's `EnchantClock` while the world is mounted behind the store); the model
 * just spins gently on hover.
 */

export interface WeaponThumbHandle {
  canvas: HTMLCanvasElement;
  weaponId: string;
  /** Apply this enchant to the weapon's showpiece parts (enchant tiles). */
  enchant?: { effect: EnchantEffect; color: string; color2?: string };
}

let renderer: WebGLRenderer | null = null;
let scene: Scene;
let camera: PerspectiveCamera;
let stage: Group;
const thumbs = new Set<WeaponThumbHandle>();
const dirty = new Map<WeaponThumbHandle, number>();
const hovered = new Set<WeaponThumbHandle>();
const STATIC_FRAMES = 4;
let raf = 0;
let startMs = 0;

/** Models scaled so their largest dimension equals this (fits a fixed camera). */
const TARGET = 1.7;
/** Built weapon models, cached by `weaponId|effect|color|color2`. */
const models = new Map<string, Group | null>();

function geomFor(part: PlaceholderPart): BufferGeometry {
  const a = part.args;
  switch (part.shape) {
    case 'box':
      return new BoxGeometry(a[0], a[1], a[2]);
    case 'sphere':
      return new SphereGeometry(a[0], a[1] ?? 12, a[2] ?? 12);
    case 'capsule':
      return new CapsuleGeometry(a[0], a[1], a[2] ?? 4, a[3] ?? 8);
    case 'cone':
      return new ConeGeometry(a[0], a[1], a[2] ?? 8);
    case 'cylinder':
      return new CylinderGeometry(a[0], a[1], a[2], a[3] ?? 8);
    case 'torus':
      return new TorusGeometry(a[0], a[1], a[2] ?? 8, a[3] ?? 12, a[4]);
    default:
      return new BoxGeometry(0.1, 0.1, 0.1);
  }
}

function modelKey(h: WeaponThumbHandle): string {
  const e = h.enchant;
  return `${h.weaponId}|${e ? `${e.effect}|${e.color}|${e.color2 ?? ''}` : ''}`;
}

/** Build (or fetch the cached) weapon model for a thumb, centered + scaled to the
 *  standard frame and posed diagonally. Null for non-placeholder weapons. */
function buildModel(h: WeaponThumbHandle): Group | null {
  const key = modelKey(h);
  const cached = models.get(key);
  if (cached !== undefined) return cached;

  const weapon = assets.getWeapon(h.weaponId as `weapon.${string}`);
  if (!weapon || weapon.render.kind !== 'placeholder') {
    models.set(key, null);
    return null;
  }

  const parts = new Group();
  for (const part of weapon.render.parts) {
    const mat =
      h.enchant && part.enchantable
        ? enchantMaterialFor(h.enchant.effect, h.enchant.color, h.enchant.color2)
        : new MeshStandardMaterial({
            color: part.color,
            emissive: part.emissive ?? '#000000',
            emissiveIntensity: part.emissiveIntensity ?? (part.emissive ? 1 : 0),
            metalness: part.metalness ?? 0.1,
            roughness: part.roughness ?? 0.7,
            flatShading: true,
          });
    const mesh = new Mesh(geomFor(part), mat);
    if (part.position) mesh.position.set(part.position[0], part.position[1], part.position[2]);
    if (part.rotation) mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
    if (part.scale != null) {
      if (typeof part.scale === 'number') mesh.scale.setScalar(part.scale);
      else mesh.scale.set(part.scale[0], part.scale[1], part.scale[2]);
    }
    parts.add(mesh);
  }

  // Center on the bounding box, then scale to the standard frame.
  const box = new Box3().setFromObject(parts);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  parts.position.sub(center);

  const model = new Group();
  model.add(parts);
  model.scale.setScalar(TARGET / maxDim);
  // A readable diagonal 3/4 pose (Y is spun per frame in renderThumb).
  model.rotation.x = 0.32;
  model.rotation.z = -0.5;
  models.set(key, model);
  return model;
}

function init(): void {
  renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);

  scene = new Scene();
  camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 4.2);
  camera.lookAt(0, 0, 0);

  scene.add(new AmbientLight(0xffffff, 0.9));
  const key = new DirectionalLight(0xffffff, 1.5);
  key.position.set(2, 3, 4);
  scene.add(key);
  const fill = new DirectionalLight(0x88aaff, 0.45);
  fill.position.set(-3, 1, -2);
  scene.add(fill);

  stage = new Group();
  scene.add(stage);
}

function renderThumb(thumb: WeaponThumbHandle, t: number, spin: boolean): boolean {
  if (!renderer) return false;
  const { canvas } = thumb;
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return false;

  const model = buildModel(thumb);
  stage.clear();
  if (model) {
    model.rotation.y = spin ? t * 0.8 : 0.5;
    stage.add(model);
  }

  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(renderer.domElement, 0, 0, w, h);
  }
  return true;
}

function loop(now: number): void {
  if (!renderer) {
    raf = 0;
    return;
  }
  if (!startMs) startMs = now;
  const t = (now - startMs) / 1000;

  for (const [thumb, left] of dirty) {
    if (renderThumb(thumb, t, false)) {
      if (left <= 1) dirty.delete(thumb);
      else dirty.set(thumb, left - 1);
    }
  }
  for (const thumb of hovered) renderThumb(thumb, t, true);

  raf = dirty.size > 0 || hovered.size > 0 ? requestAnimationFrame(loop) : 0;
}

function ensureLoop(): void {
  if (!raf) raf = requestAnimationFrame(loop);
}

/** Start driving a weapon thumbnail; returns an unregister fn for unmount. */
export function registerWeaponThumb(handle: WeaponThumbHandle): () => void {
  if (!renderer) init();
  thumbs.add(handle);
  dirty.set(handle, STATIC_FRAMES);
  ensureLoop();
  return () => {
    thumbs.delete(handle);
    dirty.delete(handle);
    hovered.delete(handle);
  };
}

/** Toggle the gentle spin for a thumbnail (on pointer enter/leave of its card). */
export function setWeaponThumbHover(handle: WeaponThumbHandle, on: boolean): void {
  if (on) hovered.add(handle);
  else {
    hovered.delete(handle);
    dirty.set(handle, STATIC_FRAMES);
  }
  ensureLoop();
}
