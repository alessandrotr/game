import { CanvasTexture, NearestFilter, SRGBColorSpace, type BufferGeometry, type Vector3 } from 'three';
import type { CharacterClass, ClassPaint } from '@arena/shared';
import { BODY_BASE_COLOR, HEAD_BASE_COLOR } from '../assets/data/humanoid';

/** '#rgb' / '#rrggbb' → [r,g,b] bytes (sRGB, matching how a 2D canvas renders it). */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A per-character paintable surface, composed of two layers:
 *   - skin: a solid base color (the whole body/head), chosen with a color picker.
 *   - paint: a transparent overlay the player brushes onto.
 * The exposed THREE texture wraps a COMPOSITE canvas (skin, then paint on top).
 * Keeping them separate means changing the skin color recolors the base without
 * disturbing existing paint, and each persists independently.
 *
 * The body/head meshes use this composite texture as their color map (see
 * AssetMesh), so edits mutate the canvas and — with a single `needsUpdate` — show
 * live on every model sharing the texture (the studio AND the in-world avatar),
 * no React re-render required. Surfaces are owned by the per-class registry below
 * so the studio, previews, and local player all draw the SAME texture instance.
 */

/** Texture resolution. 512² gives enough texels for fine, near-per-pixel detail
 *  while a sparse painted PNG stays modest to persist/sync. */
export const PAINT_SIZE = 512;

const UNDO_DEPTH = 16;

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = PAINT_SIZE;
  canvas.height = PAINT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  // Crisp texels: no smoothing when stamping/compositing, so single pixels stay
  // sharp instead of feathering into neighbors.
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

export class PaintSurface {
  readonly texture: CanvasTexture;
  /** Composite (skin + paint) — what the texture wraps. */
  private readonly composite: HTMLCanvasElement;
  private readonly cctx: CanvasRenderingContext2D;
  /** Transparent paint overlay (brush strokes only). */
  private readonly paint: HTMLCanvasElement;
  private readonly pctx: CanvasRenderingContext2D;
  private skin: string;
  private readonly undo: ImageData[] = [];
  /** UV→local-position map (3 floats per texel) + coverage mask, built once from
   *  the mesh geometry. Lets the brush select texels by their real surface
   *  position, so a stamp is a uniform physical size even where UVs are squashed
   *  (capsule top, head poles) — paint a spot, not a whole ring. */
  private posMap: Float32Array | null = null;
  private covered: Uint8Array | null = null;
  /** Live paint-layer pixels, mutated directly during a stroke (fast bulk writes). */
  private paintImage: ImageData | null = null;

  constructor(initialSkin: string) {
    this.skin = initialSkin;
    [this.composite, this.cctx] = makeCanvas();
    [this.paint, this.pctx] = makeCanvas();
    this.recomposite();
    this.texture = new CanvasTexture(this.composite);
    this.texture.colorSpace = SRGBColorSpace;
    // Nearest-neighbor so individual painted texels render as crisp squares (true
    // per-pixel painting) rather than a blurred smear.
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
  }

  /** Redraw the composite from its layers: solid skin, then the paint overlay. */
  private recomposite(): void {
    this.cctx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
    this.cctx.fillStyle = this.skin;
    this.cctx.fillRect(0, 0, PAINT_SIZE, PAINT_SIZE);
    this.cctx.drawImage(this.paint, 0, 0);
    if (this.texture) this.texture.needsUpdate = true;
  }

  get skinColor(): string {
    return this.skin;
  }

  /** Recolor the skin base (keeps all paint). */
  setSkin(color: string): void {
    this.skin = color;
    this.recomposite();
  }

  /**
   * Build the UV→position map from the painted mesh's geometry (one-time). Each
   * texel records the local-space surface point that maps to it, by rasterizing
   * every triangle into texel space and interpolating positions. Idempotent.
   */
  ensurePositionMap(geometry: BufferGeometry): void {
    if (this.posMap) return;
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    if (!pos || !uv) return;
    const index = geometry.index;
    const N = PAINT_SIZE * PAINT_SIZE;
    const posMap = new Float32Array(N * 3);
    const covered = new Uint8Array(N);
    const triCount = index ? index.count / 3 : pos.count / 3;
    const vid = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);

    for (let t = 0; t < triCount; t++) {
      const a = vid(t, 0);
      const b = vid(t, 1);
      const c = vid(t, 2);
      // Texel-space triangle (v flipped to match the flipped CanvasTexture).
      const ax = uv.getX(a) * PAINT_SIZE;
      const ay = (1 - uv.getY(a)) * PAINT_SIZE;
      const bx = uv.getX(b) * PAINT_SIZE;
      const by = (1 - uv.getY(b)) * PAINT_SIZE;
      const cx = uv.getX(c) * PAINT_SIZE;
      const cy = (1 - uv.getY(c)) * PAINT_SIZE;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const maxX = Math.min(PAINT_SIZE - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const maxY = Math.min(PAINT_SIZE - 1, Math.ceil(Math.max(ay, by, cy)));
      const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(denom) < 1e-9) continue;
      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const sx = px + 0.5;
          const sy = py + 0.5;
          const w0 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / denom;
          const w1 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / denom;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
          const i = py * PAINT_SIZE + px;
          posMap[i * 3] = w0 * pos.getX(a) + w1 * pos.getX(b) + w2 * pos.getX(c);
          posMap[i * 3 + 1] = w0 * pos.getY(a) + w1 * pos.getY(b) + w2 * pos.getY(c);
          posMap[i * 3 + 2] = w0 * pos.getZ(a) + w1 * pos.getZ(b) + w2 * pos.getZ(c);
          covered[i] = 1;
        }
      }
    }
    this.posMap = posMap;
    this.covered = covered;
  }

  /** Snapshot the paint layer for undo + cache its pixels for fast stroke writes. */
  beginStroke(): void {
    this.paintImage = this.pctx.getImageData(0, 0, PAINT_SIZE, PAINT_SIZE);
    const snap = this.pctx.createImageData(PAINT_SIZE, PAINT_SIZE);
    snap.data.set(this.paintImage.data);
    this.undo.push(snap);
    if (this.undo.length > UNDO_DEPTH) this.undo.shift();
  }

  /**
   * Paint along the world-space segment a→b (a===b for a single dab) at a physical
   * radius, coloring every texel whose surface position lies within the brush. The
   * points are in the mesh's LOCAL space (matching the position map). This is what
   * makes the brush a consistent size everywhere, independent of UV distortion.
   */
  stampWorld(a: Vector3, b: Vector3, radius: number, color: string): void {
    if (!this.posMap || !this.covered) return;
    if (!this.paintImage) this.paintImage = this.pctx.getImageData(0, 0, PAINT_SIZE, PAINT_SIZE);
    const [r, g, bl] = hexToRgb(color);
    const data = this.paintImage.data;
    const pos = this.posMap;
    const cov = this.covered;
    const r2 = radius * radius;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const ab2 = abx * abx + aby * aby + abz * abz;
    const N = PAINT_SIZE * PAINT_SIZE;
    for (let i = 0; i < N; i++) {
      if (!cov[i]) continue;
      const px = pos[i * 3] as number;
      const py = pos[i * 3 + 1] as number;
      const pz = pos[i * 3 + 2] as number;
      // Closest point on segment a→b, then squared distance to it.
      let tt = ab2 > 0 ? ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / ab2 : 0;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      const dx = px - (a.x + abx * tt);
      const dy = py - (a.y + aby * tt);
      const dz = pz - (a.z + abz * tt);
      if (dx * dx + dy * dy + dz * dz <= r2) {
        const j = i * 4;
        data[j] = r;
        data[j + 1] = g;
        data[j + 2] = bl;
        data[j + 3] = 255;
      }
    }
    this.pctx.putImageData(this.paintImage, 0, 0);
    this.recomposite();
  }

  popUndo(): boolean {
    const prev = this.undo.pop();
    if (!prev) return false;
    this.pctx.putImageData(prev, 0, 0);
    this.paintImage = null;
    this.recomposite();
    return true;
  }

  canUndo(): boolean {
    return this.undo.length > 0;
  }

  /** Wipe the paint overlay back to bare skin (keeps the skin color). */
  clearPaint(): void {
    this.pctx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
    this.paintImage = null;
    this.recomposite();
  }

  /** Serialize the paint OVERLAY (transparent) to a PNG data URL. Skin color is
   *  persisted separately, so loading both restores the editable two-layer state. */
  toPaintDataURL(): string {
    return this.paint.toDataURL('image/png');
  }

  /** Paint a previously-saved overlay PNG back onto the paint layer. */
  async loadPaintDataURL(url: string): Promise<void> {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('paint image failed to load'));
      img.src = url;
    });
    this.pctx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
    this.pctx.drawImage(img, 0, 0, PAINT_SIZE, PAINT_SIZE);
    this.paintImage = null;
    this.recomposite();
  }
}

// --- per-owner, per-part registry ---
// Head and body are separate meshes, so each gets its own surface: independent
// skin color + paint. Surfaces are keyed by an OWNER plus part — the owner is the
// character class for the local player's editable surfaces, or a remote player's
// session id for the read-only copies fetched over HTTP. The part names match the
// paintable placeholder part names.

export const PAINT_PARTS = ['body', 'head'] as const;
export type PaintPart = (typeof PAINT_PARTS)[number];

/** Textures keyed by part name, as consumed by AssetMesh's paintable parts. */
export type PaintTextures = Partial<Record<PaintPart, CanvasTexture | null>>;

const registry = new Map<string, PaintSurface>();

/** Default skin color for a part: a skin tone for the head, neutral for the body. */
export function defaultSkin(part: PaintPart): string {
  return part === 'head' ? HEAD_BASE_COLOR : BODY_BASE_COLOR;
}

/** The surface for an owner (class id locally, session id for a remote peer). */
export function getPaintSurface(owner: string, part: PaintPart): PaintSurface {
  const key = `${owner}:${part}`;
  let surface = registry.get(key);
  if (!surface) {
    surface = new PaintSurface(defaultSkin(part));
    registry.set(key, surface);
  }
  return surface;
}

/** The body + head textures for an owner, for handing to a model's `paint` prop. */
export function paintTexturesFor(owner: string): PaintTextures {
  return {
    body: getPaintSurface(owner, 'body').texture,
    head: getPaintSurface(owner, 'head').texture,
  };
}

/** Paint a fetched {@link ClassPaint} onto an owner's surfaces (skin + overlay),
 *  for displaying a remote player's look. Missing parts reset to bare default. */
export async function applyClassPaint(owner: string, paint: ClassPaint | undefined): Promise<void> {
  for (const part of PAINT_PARTS) {
    const surface = getPaintSurface(owner, part);
    const data = paint?.[part];
    surface.setSkin(data?.skin || defaultSkin(part));
    if (data?.png) await surface.loadPaintDataURL(data.png);
    else surface.clearPaint();
  }
}

/** Serialize a class's local surfaces into a {@link ClassPaint} (for persistence). */
export function classPaintOf(characterClass: CharacterClass): ClassPaint {
  const out: ClassPaint = {};
  for (const part of PAINT_PARTS) {
    const surface = getPaintSurface(characterClass, part);
    out[part] = { skin: surface.skinColor, png: surface.toPaintDataURL() };
  }
  return out;
}
