import { Leva } from 'leva';
import { TUNING_MODULES } from './tuningModules';
import { TuningPanel } from './TuningPanel';
import { AbilityPanel } from './AbilityPanel';

/**
 * Dev-tools root: the Leva panel UI plus one binding panel per tuning module.
 * This file is the **only** module that imports Leva, and it is loaded solely
 * via the dynamic import in `index.tsx` (guarded by `import.meta.env.DEV`), so
 * Leva and all tooling are tree-shaken out of production builds.
 *
 * Extend the system by adding a `TuningModule` (in `tuningModules.ts`) or a new
 * dedicated panel component here — no gameplay code changes.
 */
export default function DevTools() {
  return (
    <>
      <Leva collapsed titleBar={{ title: 'Dev Tools' }} />
      {TUNING_MODULES.map((module) => (
        <TuningPanel key={module.id} module={module} />
      ))}
      <AbilityPanel />
    </>
  );
}
