import { Leva, button, useControls } from 'leva';
import {
  CLASS_DEFINITIONS,
  CLASS_STAT_FIELD_META,
  MOVEMENT_FIELD_META,
  PERKS,
  PERK_IDS,
  type CharacterClass,
  type ClassStats,
  type MovementConfig,
  type PerkId,
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
import {
  sendBotControl,
  sendDevGrantPerk,
  sendDevAddLevel,
  sendDevSpawnTrap,
  sendDevSetWave,
} from '../network/colyseus';
import { useCombatFlagsStore } from '../store/useCombatFlagsStore';
import { useDebugStore } from '../store/useDebugStore';
import { useGameStore } from '../store/useGameStore';
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

  // Zombie perks (DEV): grant any perk to yourself or wipe them all, to test
  // each effect without playing to the wave that offers it. The server ignores
  // these messages in production.
  const perkOptions = Object.fromEntries(
    PERK_IDS.map((id) => [`${PERKS[id].name} · ${PERKS[id].tier}`, id]),
  ) as Record<string, PerkId>;
  useControls('Perks (debug)', () => ({
    perk: { value: PERK_IDS[0] as PerkId, options: perkOptions, label: 'Perk' },
    Grant: button((get) =>
      sendDevGrantPerk({ action: 'grant', perkId: get('Perks (debug).perk') as PerkId }),
    ),
    'Clear all': button(() => sendDevGrantPerk({ action: 'clear' })),
  }));

  // Perf Debug (DEV): each switch HIDES one class of thing. Flip them off during
  // a laggy fight and watch the FPS meter — whichever switch makes FPS jump is the
  // culprit. All default off (show everything); dev-only, so prod is unaffected.
  useControls('Perf Debug', () => ({
    'Hide nameplates + HP bars': {
      value: false,
      onChange: (v: boolean) => useDebugStore.getState().set({ hideNameplates: v }),
    },
    'Hide combat VFX': {
      value: false,
      onChange: (v: boolean) => useDebugStore.getState().set({ hideVfx: v }),
    },
    'Hide point lights (fire/braziers)': {
      value: false,
      onChange: (v: boolean) => useDebugStore.getState().set({ hideLights: v }),
    },
    'Hide ground zones + traps': {
      value: false,
      onChange: (v: boolean) => useDebugStore.getState().set({ hideZones: v }),
    },
    'Hide pickables': {
      value: false,
      onChange: (v: boolean) => useDebugStore.getState().set({ hidePickables: v }),
    },
    'Hide barrels': {
      value: false,
      onChange: (v: boolean) => useDebugStore.getState().set({ hideBarrels: v }),
    },
    'Hide oil drums': {
      value: false,
      onChange: (v: boolean) => useDebugStore.getState().set({ hideDestructibles: v }),
    },
    'Hide houses/cars/cover': {
      value: false,
      onChange: (v: boolean) => useDebugStore.getState().set({ hideStructures: v }),
    },
    'Hide scenery props': {
      value: false,
      onChange: (v: boolean) => useDebugStore.getState().set({ hideMapProps: v }),
    },
    'Flat ground (no grass shader)': {
      value: false,
      onChange: (v: boolean) => useDebugStore.getState().set({ flatGround: v }),
    },
    'Instanced horde (test)': {
      value: false,
      onChange: (v: boolean) => useDebugStore.getState().set({ instancedHorde: v }),
    },
  }));

  // Level (DEV): jump your character up some levels to test level-gated content
  // (perk offers, cosmetics). The server ignores this in production.
  useControls('Level (debug)', () => ({
    levels: { value: 1, min: 1, max: 50, step: 1, label: 'Levels' },
    'Add levels': button((get) => sendDevAddLevel(get('Level (debug).levels') as number)),
  }));

  // Wave (DEV): jump the zombie director straight to a wave and open every door
  // that should be unlocked by then, then start that wave's horde. Lets you reach
  // late-game content (the altar at wave 13, the boss at 16) instantly. The
  // server ignores this in production and outside zombie mode.
  useControls('Wave (debug)', () => ({
    wave: { value: 13, min: 1, max: 30, step: 1, label: 'Wave' },
    'Jump to wave': button((get) => sendDevSetWave(get('Wave (debug).wave') as number)),
  }));

  // Traps (DEV): spawn any trap kind at your current location for testing.
  useControls('Traps (debug)', () => ({
    kind: { value: 'heal', options: ['heal', 'death', 'singularity', 'buff'], label: 'Kind' },
    radius: { value: 6, min: 2, max: 15, step: 0.5, label: 'Radius' },
    'Spawn Trap': button((get) => {
      const kind = get('Traps (debug).kind') as 'heal' | 'death' | 'singularity' | 'buff';
      const radius = get('Traps (debug).radius') as number;
      const store = useGameStore.getState();
      const sessionId = store.sessionId;
      const player = sessionId ? store.players.get(sessionId) : null;
      const x = player?.x ?? 0;
      const z = player?.z ?? 0;
      sendDevSpawnTrap({ kind, x, z, radius });
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

      <EnvPanels />
      <AbilityPanels />
    </>
  );
}
