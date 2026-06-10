import { useEffect } from 'react';
import { button } from 'leva';
import { defaultTuning, type FlatSection, type Tuning } from '../tuning/defaults';
import { useTuningStore } from '../tuning/useTuningStore';
import { useLevaSection } from './levaControls';
import type { TuningModule } from './tuningModules';

/**
 * Generic dev panel for one flat tuning section. It only mirrors Leva controls
 * into the tuning store (and offers a per-section reset) — no gameplay logic
 * lives here. The Leva schema is built from the section's defaults + control
 * meta, so adding a field needs no panel code.
 */
export function TuningPanel({ module }: { module: TuningModule }) {
  const sectionDefaults = defaultTuning[module.section] as unknown as Record<string, number>;

  const [values, set] = useLevaSection(
    module.folder,
    () => {
      const schema: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(sectionDefaults)) {
        schema[key] = { value, ...(module.controls[key] ?? {}) };
      }
      schema['Reset to defaults'] = button(() => set(sectionDefaults));
      return schema;
    },
    { collapsed: true },
  );

  useEffect(() => {
    useTuningStore
      .getState()
      .setSection(module.section as FlatSection, values as unknown as Partial<Tuning[FlatSection]>);
  }, [module.section, values]);

  return null;
}
