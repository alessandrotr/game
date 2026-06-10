/**
 * Pooled floating combat text (Phase 7.2).
 *
 * A fixed pool of reusable slots — never grows, never allocates per number.
 * `spawnFloatingText` claims a free slot (or recycles the oldest when full); the
 * R3F layer reads these slots imperatively each frame and animates pre-mounted
 * text meshes, so showing a number costs no React render and no troika mount.
 *
 * Plain mutable singleton, in the spirit of the other render-free stores.
 */

/** Number of simultaneously visible combat numbers. */
export const FLOATING_TEXT_POOL = 32;

export interface FloatingTextSlot {
  active: boolean;
  /** World-space anchor the number rises from. */
  x: number;
  y: number;
  z: number;
  /** Small horizontal scatter so stacked hits don't perfectly overlap. */
  spread: number;
  text: string;
  color: string;
  /** `performance.now()` when spawned; the layer derives age → rise + fade. */
  born: number;
}

const slots: FloatingTextSlot[] = Array.from({ length: FLOATING_TEXT_POOL }, () => ({
  active: false,
  x: 0,
  y: 0,
  z: 0,
  spread: 0,
  text: '',
  color: '#ffffff',
  born: 0,
}));

let recycleCursor = 0;

/** Spawn a combat number. Reuses a free slot, or the oldest if the pool is full. */
export function spawnFloatingText(
  x: number,
  y: number,
  z: number,
  text: string,
  color: string,
): void {
  let index = slots.findIndex((s) => !s.active);
  if (index < 0) {
    index = recycleCursor;
    recycleCursor = (recycleCursor + 1) % FLOATING_TEXT_POOL;
  }
  const slot = slots[index]!;
  slot.active = true;
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.spread = (Math.random() - 0.5) * 0.8;
  slot.text = text;
  slot.color = color;
  slot.born = performance.now();
}

export function getFloatingTextSlots(): readonly FloatingTextSlot[] {
  return slots;
}

/** Deactivate every slot (e.g. on disconnect). */
export function clearFloatingText(): void {
  for (const slot of slots) slot.active = false;
}
