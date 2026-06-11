import {
  ABILITY_FIELD_META,
  ABILITY_KINDS,
  CLASS_DEFINITIONS,
  type AbilityConfig,
  type CharacterClass,
} from '@arena/shared';
import { effectiveAbilityBase, effectiveAbilityForClass, useTuningStore } from '../tuning';
import { MetaPanel } from './MetaPanel';

const titleCase = (s: string) =>
  s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const asNumbers = (cfg: AbilityConfig) => cfg as unknown as Record<string, number>;

/**
 * Ability balance folders, generated from the shared meta: one per ability for
 * the GLOBAL base, plus one per (class, ability-in-its-kit) for PER-CLASS
 * overrides. Editing a class folder only diverges that class; the global folder
 * moves the shared baseline.
 */
export function AbilityPanels() {
  const classes = Object.keys(CLASS_DEFINITIONS) as CharacterClass[];
  return (
    <>
      {ABILITY_KINDS.map((kind) => (
        <MetaPanel
          key={`global-${kind}`}
          folder={`Ability (Global) · ${titleCase(kind)}`}
          meta={ABILITY_FIELD_META}
          getInitial={() => asNumbers(effectiveAbilityBase(useTuningStore.getState().overrides, kind))}
          onChange={(patch) => useTuningStore.getState().setAbilityBase(kind, patch as Partial<AbilityConfig>)}
        />
      ))}
      {classes.flatMap((c) =>
        CLASS_DEFINITIONS[c].abilities.map((kind) => (
          <MetaPanel
            key={`${c}-${kind}`}
            folder={`${CLASS_DEFINITIONS[c].name} · ${titleCase(kind)}`}
            meta={ABILITY_FIELD_META}
            getInitial={() =>
              asNumbers(effectiveAbilityForClass(useTuningStore.getState().overrides, c, kind))
            }
            onChange={(patch) =>
              useTuningStore.getState().setClassAbility(c, kind, patch as Partial<AbilityConfig>)
            }
          />
        )),
      )}
    </>
  );
}
