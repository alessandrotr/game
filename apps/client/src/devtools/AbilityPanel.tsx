import { useEffect } from 'react';
import { button } from 'leva';
import { defaultTuning, type AbilityId, type AbilityTuning } from '../tuning/defaults';
import { useTuningStore } from '../tuning/useTuningStore';
import { useLevaSection } from './levaControls';
import type { ControlMeta } from './tuningModules';

/** Control metadata shared across abilities, keyed by ability field name. */
const ABILITY_CONTROLS: Record<string, ControlMeta> = {
  damage: { min: 0, max: 200, step: 1, label: 'Damage' },
  cooldown: { min: 0, max: 30, step: 0.1, label: 'Cooldown (s)' },
  manaCost: { min: 0, max: 200, step: 1, label: 'Mana Cost' },
  castTime: { min: 0, max: 5, step: 0.05, label: 'Cast Time (s)' },
  projectileSpeed: { min: 0, max: 60, step: 0.5, label: 'Projectile Speed' },
  distance: { min: 0, max: 30, step: 0.1, label: 'Distance' },
  aoeRadius: { min: 0, max: 15, step: 0.1, label: 'AoE Radius' },
  amount: { min: 0, max: 200, step: 1, label: 'Amount' },
};

const titleCase = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** One Leva folder per ability — each isolated so field names can repeat. */
function AbilityControls({ id }: { id: AbilityId }) {
  const abilityDefaults = defaultTuning.abilities[id] as unknown as Record<string, number>;

  const [values, set] = useLevaSection(
    `Ability · ${titleCase(id)}`,
    () => {
      const schema: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(abilityDefaults)) {
        schema[key] = { value, ...(ABILITY_CONTROLS[key] ?? {}) };
      }
      schema['Reset to defaults'] = button(() => set(abilityDefaults));
      return schema;
    },
    { collapsed: true },
  );

  useEffect(() => {
    useTuningStore.getState().setAbility(id, values as unknown as Partial<AbilityTuning>);
  }, [id, values]);

  return null;
}

/**
 * Combat balancing panel. Renders a folder per ability, derived from the
 * registry — adding an ability to `defaultTuning.abilities` (and `AbilityId`)
 * makes a panel appear automatically, with no changes here.
 */
export function AbilityPanel() {
  const ids = Object.keys(defaultTuning.abilities) as AbilityId[];
  return (
    <>
      {ids.map((id) => (
        <AbilityControls key={id} id={id} />
      ))}
    </>
  );
}
