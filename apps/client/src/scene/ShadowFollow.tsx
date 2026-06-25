import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { type DirectionalLight, Vector3 } from 'three';
import { ARENA_HALF_SIZE } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';

/**
 * Camera-following shadow frustum for the zombie room expansion system.
 *
 * The directional light's shadow camera is re-centred on the local player
 * each frame, keeping the frustum small (ARENA_HALF_SIZE) for crisp shadows
 * even as the play area expands to ZOMBIE_ROOM_HALF_SIZE. This is the standard
 * open-world technique: the shadow map quality stays identical to the original
 * arena because the frustum size never grows.
 *
 * Only active when zombie room mode has sections; in normal arena/town the
 * shadows work exactly as today (static frustum covering ARENA_HALF_SIZE).
 */
export function ShadowFollow() {
  const lightRef = useRef<DirectionalLight | null>(null);
  const initialOffset = useRef<Vector3>(new Vector3());
  const { scene } = useThree();

  useFrame(() => {
    // Find the directional light on first frame.
    if (!lightRef.current) {
      scene.traverse((obj) => {
        if (
          !lightRef.current &&
          (obj as DirectionalLight).isDirectionalLight &&
          (obj as DirectionalLight).castShadow
        ) {
          const light = obj as DirectionalLight;
          lightRef.current = light;
          initialOffset.current.copy(light.position).sub(light.target.position);
        }
      });
      return;
    }

    const light = lightRef.current;
    if (!light.shadow) return;

    // Read the local player's position imperatively (no React re-render).
    const sessionId = useGameStore.getState().sessionId;
    if (!sessionId) return;
    const players = useGameStore.getState().players;
    const player = players.get(sessionId);
    if (!player) return;

    // Configure static camera bounds once to avoid per-frame projection matrix updates
    const cam = light.shadow.camera;
    const extent = ARENA_HALF_SIZE;
    if (cam.left !== -extent) {
      cam.left = -extent;
      cam.right = extent;
      cam.top = extent;
      cam.bottom = -extent;
      cam.updateProjectionMatrix();
    }

    // The directional light's position sets the "sun direction" relative to its
    // target. Keep the same offset but shift the base.
    light.target.position.set(player.x, 0, player.z);
    light.position.copy(light.target.position).add(initialOffset.current);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
  });

  return null;
}
