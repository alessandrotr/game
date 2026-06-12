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
import { useEnvStore } from '../tuning/useEnvStore';
import { sendBotControl } from '../network/colyseus';
import { useCombatFlagsStore } from '../store/useCombatFlagsStore';
import { MetaPanel } from './MetaPanel';
import { AbilityPanels } from './AbilityPanel';
import { EnvPanels } from './EnvPanel';

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
    'Reset environment': button(() => {
      useEnvStore.getState().reset();
      window.location.reload();
    }),
  }));

  // Practice bots (arena only — the town has no handler, so Apply is a no-op
  // there). "Apply" reconciles the live bot population to these settings.
  useControls('Bots', () => ({
    count: { value: 0, min: 0, max: 8, step: 1, label: 'Count' },
    difficulty: { value: 'medium', options: ['easy', 'medium', 'hard'], label: 'Difficulty' },
    characterClass: {
      label: 'Class',
      value: '',
      options: { Random: '', Warrior: 'warrior', Mage: 'mage', Archer: 'archer', Priest: 'priest' },
    },
    Apply: button((get) =>
      sendBotControl({
        count: get('Bots.count') as number,
        difficulty: get('Bots.difficulty') as 'easy' | 'medium' | 'hard',
        characterClass: (get('Bots.characterClass') as CharacterClass | '') || undefined,
      }),
    ),
  }));

  // Combat feature flags. Auto-attacks are off by default (abilities-only); flip
  // this to re-enable left-click auto-attacks for the room.
  useControls('Combat', () => ({
    'Auto-attacks': {
      value: useCombatFlagsStore.getState().autoAttack,
      onChange: (v: boolean) => useCombatFlagsStore.getState().setAutoAttack(v),
    },
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

      <EnvPanels />
      <AbilityPanels />
    </>
  );
}
