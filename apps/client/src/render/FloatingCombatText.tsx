import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { Quaternion } from 'three';
import { FLOATING_TEXT_POOL, getFloatingTextSlots } from '../store/floatingText';

/** How long a number lives before recycling, in ms. */
const LIFETIME_MS = 1000;
/** World units a number rises over its lifetime. */
const RISE = 1.4;

/**
 * The combat-text shape we drive imperatively. troika's Text (what drei's
 * `<Text>` wraps) is an Object3D with these extra fields; `.sync()` re-lays out
 * after the string changes.
 */
interface TextMesh {
  text: string;
  color: string;
  fillOpacity: number;
  visible: boolean;
  position: { set(x: number, y: number, z: number): void };
  quaternion: { copy(q: Quaternion): void };
  sync(): void;
}

/**
 * Floating damage/heal numbers (Phase 7.2). Pre-mounts a fixed pool of text
 * meshes and drives them straight from the `floatingText` slot store each frame
 * — no per-number React render or troika mount. Numbers rise, face the camera,
 * and fade out, then their slot is freed for reuse.
 */
export function FloatingCombatText() {
  const meshes = useRef<(TextMesh | null)[]>([]);
  const lastText = useRef<string[]>(Array(FLOATING_TEXT_POOL).fill(''));
  const lastColor = useRef<string[]>(Array(FLOATING_TEXT_POOL).fill(''));
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    const now = performance.now();
    const slots = getFloatingTextSlots();

    for (let i = 0; i < FLOATING_TEXT_POOL; i++) {
      const mesh = meshes.current[i];
      if (!mesh) continue;
      const slot = slots[i]!;

      if (!slot.active) {
        if (mesh.visible) mesh.visible = false;
        continue;
      }

      const age = (now - slot.born) / LIFETIME_MS;
      if (age >= 1) {
        slot.active = false;
        mesh.visible = false;
        continue;
      }

      if (!mesh.visible) mesh.visible = true;

      // Re-lay out only when the string actually changes (cost of `.sync()`).
      if (lastText.current[i] !== slot.text || lastColor.current[i] !== slot.color) {
        mesh.text = slot.text;
        mesh.color = slot.color;
        lastText.current[i] = slot.text;
        lastColor.current[i] = slot.color;
        mesh.sync();
      }

      mesh.position.set(slot.x + slot.spread, slot.y + age * RISE, slot.z);
      mesh.quaternion.copy(camera.quaternion); // billboard toward the camera
      mesh.fillOpacity = 1 - age * age; // ease-out fade
    }
  });

  return (
    <>
      {Array.from({ length: FLOATING_TEXT_POOL }).map((_, i) => (
        <Text
          key={i}
          ref={(el) => {
            meshes.current[i] = el as unknown as TextMesh | null;
          }}
          fontSize={0.55}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#000000"
          visible={false}
        >
          {/* Content is set imperatively; this initial value is never shown. */}
          {''}
        </Text>
      ))}
    </>
  );
}
