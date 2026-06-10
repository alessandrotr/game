import { CLASS_LIST, getClassDefinition, type ClassDefinition } from '@arena/shared';
import { useCharacterStore } from '../store/useCharacterStore';
import { useAuthStore } from '../store/useAuthStore';

// Upper bounds used to normalize the comparison bars.
const STAT_MAX = { health: 160, mana: 150, moveSpeed: 8, attackDamage: 60 };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function StatRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const ratio = Math.max(0, Math.min(1, value / max));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/50">
        <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: color }} />
      </div>
      <span className="w-8 text-right tabular-nums text-white/80">{value}</span>
    </div>
  );
}

function ClassInfo({ def }: { def: ClassDefinition }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
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
          <span
            key={ability}
            className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-wider text-gold"
          >
            {capitalize(ability)}
          </span>
        ))}
      </div>
    </div>
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
              style={isSelected ? { borderColor: 'var(--color-gold)' } : undefined}
              className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                isSelected
                  ? 'bg-gold/10'
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
