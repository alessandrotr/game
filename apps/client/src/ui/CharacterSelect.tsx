import { CLASS_LIST, getClassDefinition, type ClassDefinition } from '@arena/shared';
import { useCharacterStore } from '../store/useCharacterStore';
import { useAuthStore } from '../store/useAuthStore';
import { Badge, Card, Meter } from './primitives';

// Upper bounds used to normalize the comparison bars.
const STAT_MAX = { health: 160, mana: 150, moveSpeed: 8, attackDamage: 60 };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A class comparison stat (Health / Mana / …) — `Meter` tuned for this screen. */
function StatRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <Meter
      value={value}
      max={max}
      fill={color}
      label={label}
      valueText={value}
      className="text-xs"
      labelClassName="w-16"
      valueClassName="w-8"
    />
  );
}

function ClassInfo({ def }: { def: ClassDefinition }) {
  return (
    <Card variant="inset">
      <p className="mb-3 text-[13px] leading-relaxed text-muted">{def.description}</p>
      <div className="flex flex-col gap-2">
        <StatRow label="Health" value={def.stats.health} max={STAT_MAX.health} color={def.color} />
        <StatRow label="Mana" value={def.stats.mana} max={STAT_MAX.mana} color={def.color} />
        <StatRow label="Speed" value={def.stats.moveSpeed} max={STAT_MAX.moveSpeed} color={def.color} />
        <StatRow
          label="Damage"
          value={def.stats.attackDamage}
          max={STAT_MAX.attackDamage}
          color={def.color}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {def.abilities.map((ability) => (
          <Badge key={ability} variant="gold">
            {capitalize(ability)}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

/** Class cards (gold-accented) + the selected class's stats/abilities. Each card
 *  shows the account's level on that class (from persisted progression). */
export function CharacterSelect() {
  const selected = useCharacterStore((s) => s.selectedClass);
  const setSelected = useCharacterStore((s) => s.setSelectedClass);
  const progress = useAuthStore((s) => s.progress);
  const def = getClassDefinition(selected);

  // Level reached per class (classes never played default to 1).
  const levelByClass = new Map(progress.map((p) => [p.characterClass, p.level]));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {CLASS_LIST.map((c) => {
          const isSelected = c.id === selected;
          const level = levelByClass.get(c.id) ?? 1;
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => setSelected(c.id)}
              aria-pressed={isSelected}
              // Selected card adopts the class color (border + faint tint) so the
              // chosen class reads as one identity; gold stays for the CTA.
              style={isSelected ? { borderColor: c.color, background: `${c.color}14` } : undefined}
              className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                isSelected
                  ? ''
                  : 'border-white/10 bg-black/30 hover:border-white/25 hover:bg-black/40'
              }`}
            >
              <span
                className="h-8 w-1.5 shrink-0 rounded-full"
                style={{ background: c.color, boxShadow: `0 0 10px ${c.color}` }}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-sm tracking-wide text-white">{c.name}</span>
                <span className="block truncate text-[11px] text-muted">{c.role}</span>
              </span>
              <span
                className="shrink-0 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                style={{ color: c.color }}
                title={`Level ${level} ${c.name}`}
              >
                Lv {level}
              </span>
            </button>
          );
        })}
      </div>
      <ClassInfo def={def} />
    </div>
  );
}
