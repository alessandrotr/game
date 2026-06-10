import type { AnimationDescriptor } from '@arena/shared';

/**
 * Logical animations. For placeholder meshes (no skeleton) the renderer plays
 * the `procedural` fallback; when a GLTF is bound, `clip` names the real clip.
 */
export const ANIMATIONS: AnimationDescriptor[] = [
  { id: 'anim.idle', name: 'idle', loop: true, procedural: 'bob', clip: 'Idle' },
  { id: 'anim.walk', name: 'walk', loop: true, procedural: 'none', clip: 'Walk' },
  { id: 'anim.run', name: 'run', loop: true, procedural: 'none', clip: 'Run' },
  { id: 'anim.attack', name: 'attack', loop: false, procedural: 'none', clip: 'Attack' },
  { id: 'anim.cast', name: 'cast', loop: false, procedural: 'pulse', clip: 'Cast' },
  { id: 'anim.hit', name: 'hit', loop: false, procedural: 'none', clip: 'Hit' },
  { id: 'anim.die', name: 'die', loop: false, procedural: 'none', clip: 'Die' },
];
