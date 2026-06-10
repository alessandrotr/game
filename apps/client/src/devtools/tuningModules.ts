import type { FlatSection } from '../tuning/defaults';

/** Leva number-control metadata for one tunable field. */
export interface ControlMeta {
  min?: number;
  max?: number;
  step?: number;
  /** Human label shown in the panel (key stays the gameplay field name). */
  label?: string;
}

/** A dev-tools panel bound to one flat tuning section. */
export interface TuningModule<K extends FlatSection = FlatSection> {
  id: string;
  /** Leva folder title. */
  folder: string;
  /** Tuning store section this panel writes to. */
  section: K;
  /** Control metadata, keyed by the section's field names. */
  controls: Record<string, ControlMeta>;
}

/**
 * The dev-tools module registry. To add a panel for a new flat section, append
 * a module here — `DevTools` renders one `<TuningPanel>` per entry. Ability and
 * other non-flat tooling live in their own dedicated panels.
 */
export const TUNING_MODULES: TuningModule[] = [
  {
    id: 'player',
    folder: 'Player',
    section: 'player',
    controls: {
      walkSpeed: { min: 0, max: 20, step: 0.1, label: 'Move Speed' },
      sprintSpeed: { min: 0, max: 30, step: 0.1, label: 'Sprint Speed' },
      jumpForce: { min: 0, max: 20, step: 0.1, label: 'Jump Force' },
      rotationSpeed: { min: 0, max: 30, step: 0.5, label: 'Rotation Speed' },
      stoppingDistance: { min: 0, max: 5, step: 0.05, label: 'Stopping Distance' },
      sprintThreshold: { min: 0, max: 30, step: 0.5, label: 'Sprint Threshold' },
    },
  },
  {
    id: 'combat',
    folder: 'Combat',
    section: 'combat',
    controls: {
      baseDamage: { min: 0, max: 200, step: 1, label: 'Base Damage' },
      manaRegen: { min: 0, max: 50, step: 0.5, label: 'Mana Regen /s' },
      cooldownMultiplier: { min: 0.1, max: 3, step: 0.05, label: 'Cooldown ×' },
    },
  },
  {
    id: 'arena',
    folder: 'Arena',
    section: 'arena',
    controls: {
      matchDuration: { min: 30, max: 1800, step: 10, label: 'Match Duration (s)' },
      respawnDelay: { min: 0, max: 30, step: 0.5, label: 'Respawn Delay (s)' },
    },
  },
  {
    id: 'camera',
    folder: 'Camera',
    section: 'camera',
    controls: {
      distance: { min: 2, max: 30, step: 0.1, label: 'Distance / Zoom' },
      height: { min: 0, max: 30, step: 0.1, label: 'Height / Angle' },
      followSmoothing: { min: 0.5, max: 30, step: 0.1, label: 'Follow Smoothing' },
    },
  },
  {
    id: 'ai',
    folder: 'AI',
    section: 'ai',
    controls: {
      aggroRadius: { min: 0, max: 50, step: 0.5, label: 'Aggro Radius' },
      reactionTime: { min: 0, max: 3, step: 0.05, label: 'Reaction Time (s)' },
      wanderSpeed: { min: 0, max: 10, step: 0.1, label: 'Wander Speed' },
    },
  },
];
