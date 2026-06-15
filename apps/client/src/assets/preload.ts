import { useGLTF } from '@react-three/drei';
import { CHARACTERS } from './data/characters';
import { gltfSkinUrls } from './CharacterFactory';

/**
 * Kick off fetching the rigged class/character GLBs up front (drei caches per
 * URL, so this just front-runs the load) — so the character-select portraits and
 * the in-world models don't pop in blank. Driven by `useProgress` for the
 * on-screen loading bar. Safe to call repeatedly; placeholders (primitive bodies)
 * have nothing to fetch and are skipped.
 */
export function preloadCharacterModels(): void {
  for (const c of CHARACTERS) {
    if (c.render.kind === 'gltf') useGLTF.preload(c.render.url);
  }
}

/**
 * Front-run the zombie/sprinter/fat skin GLBs. Called when entering zombie mode
 * so the first wave's models are already parsed — otherwise the first spawn of
 * each variant hitches while its GLB downloads + parses on the main thread.
 */
export function preloadZombieModels(): void {
  for (const url of gltfSkinUrls()) useGLTF.preload(url);
}
