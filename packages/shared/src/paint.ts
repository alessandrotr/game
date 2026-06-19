import { CHARACTER_CLASSES, type CharacterClass } from './assets.js';

/**
 * Free-form character "paint": a per-class, per-part skin color + a painted
 * overlay (a PNG data URL). Unlike catalog cosmetics there's no fixed set to
 * validate against — only size/shape limits — so it lives in its own column and
 * its own routes, mirroring the cosmetics plumbing. The overlay is the
 * transparent paint layer only; the skin is the solid base beneath it.
 */

/** The paintable parts of the body (must match the client's PAINT_PARTS). */
export const PAINT_PARTS = ['body', 'head'] as const;
export type PaintPart = (typeof PAINT_PARTS)[number];

export interface PaintPartData {
  /** Solid base color, hex (e.g. '#e6b98f'). */
  skin: string;
  /** Painted overlay as a PNG data URL, or '' for none. */
  png: string;
}

export type ClassPaint = Partial<Record<PaintPart, PaintPartData>>;
export type PaintState = Partial<Record<CharacterClass, ClassPaint>>;

/** Max accepted overlay PNG size (data URL chars). A sparse 512² overlay is a few
 *  KB; this caps a worst-case full-coverage paint while staying well under any
 *  row limit. Oversized overlays are dropped (treated as no paint). */
export const MAX_PAINT_PNG_CHARS = 200_000;

const HEX = /^#[0-9a-fA-F]{3,8}$/;

function sanitizePart(raw: unknown): PaintPartData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const skin = typeof r.skin === 'string' && HEX.test(r.skin) ? r.skin : '';
  const png =
    typeof r.png === 'string' && r.png.startsWith('data:image/png') && r.png.length <= MAX_PAINT_PNG_CHARS
      ? r.png
      : '';
  if (!skin && !png) return undefined;
  return { skin, png };
}

/** Validate/shape an untrusted paint state: known classes + parts only, hex skin
 *  colors, bounded PNG data URLs. Anything invalid is dropped. */
export function sanitizePaint(raw: unknown): PaintState {
  const out: PaintState = {};
  if (!raw || typeof raw !== 'object') return out;
  const map = raw as Record<string, unknown>;
  for (const cls of CHARACTER_CLASSES) {
    const entry = map[cls];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const clazz: ClassPaint = {};
    for (const part of PAINT_PARTS) {
      const part_ = sanitizePart(e[part]);
      if (part_) clazz[part] = part_;
    }
    if (Object.keys(clazz).length) out[cls] = clazz;
  }
  return out;
}

/** A short content revision for a class's paint, so peers know when to refetch.
 *  Cheap rolling hash over the parts — not cryptographic, just change detection. */
export function paintRevOf(paint: ClassPaint | undefined): string {
  if (!paint) return '';
  let h = 2166136261;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  for (const part of PAINT_PARTS) {
    const p = paint[part];
    if (!p) continue;
    feed(part);
    feed(p.skin);
    feed(p.png);
  }
  return (h >>> 0).toString(36);
}
