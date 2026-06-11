import { Leva, button, useControls } from 'leva';
import {
  CLASS_DEFINITIONS,
  CLASS_STAT_FIELD_META,
  MOVEMENT_FIELD_META,
  type CharacterClass,
  type ClassStats,
  type MovementConfig,
} from '@arena/shared';
import {
  CAMERA_FIELD_META,
  effectiveCamera,
  effectiveClassStats,
  effectiveMovement,
  getExportedBalance,
  useTuningStore,
  type CameraConfig,
} from '../tuning';
import { MetaPanel } from './MetaPanel';
import { AbilityPanels } from './AbilityPanel';

/**
 * Dev-tools root: the Leva UI plus tuning folders generated from the shared
 * balance metadata (movement feel, per-class stats, ability base + per-class
 * overrides) and the client-only camera. The only module that imports Leva, so
 * it (and Leva) tree-shakes out of production when gated by `import.meta.env.DEV`.
 *
 * "Export to clipboard" copies a paste-ready snapshot of the current effective
 * balance to commit back into the canonical shared files; "Reset all" clears the
 * persisted overrides.
 */
export default function DevTools() {
  useControls('Balance', () => ({
    'Export to clipboard': button(() => {
      const snapshot = getExportedBalance();
      void navigator.clipboard?.writeText(snapshot);
      console.log('[balance] exported snapshot:\n' + snapshot);
    }),
    'Reset all overrides': button(() => {
      useTuningStore.getState().reset();
      window.location.reload();
    }),
  }));

  const classes = Object.keys(CLASS_DEFINITIONS) as CharacterClass[];
  const store = () => useTuningStore.getState();

  return (
    <>
      <Leva collapsed titleBar={{ title: 'Dev Tools' }} />

      <MetaPanel
        folder="Movement"
        meta={MOVEMENT_FIELD_META}
        getInitial={() => effectiveMovement(store().overrides) as unknown as Record<string, number>}
        onChange={(p) => store().setMovement(p as Partial<MovementConfig>)}
      />
      <MetaPanel
        folder="Camera"
        meta={CAMERA_FIELD_META}
        getInitial={() => effectiveCamera(store().overrides) as unknown as Record<string, number>}
        onChange={(p) => store().setCamera(p as Partial<CameraConfig>)}
      />

      {classes.map((c) => (
        <MetaPanel
          key={c}
          folder={`${CLASS_DEFINITIONS[c].name} · Stats`}
          meta={CLASS_STAT_FIELD_META}
          getInitial={() => effectiveClassStats(store().overrides, c) as unknown as Record<string, number>}
          onChange={(p) => store().setClassStat(c, p as Partial<ClassStats>)}
        />
      ))}

      <AbilityPanels />
    </>
  );
}
