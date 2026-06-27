import { type ReactNode } from 'react';
import {
  ABILITIES,
  ABILITY_SLOTS,
  CLASS_DEFINITIONS,
  CLASS_LOADOUTS,
  claimableCount,
  classCosmeticsOf,
  describeAbility,
  getClassDefinition,
  getCosmeticOfType,
  xpProgress,
  type AbilityKind,
  type CharacterClass,
} from '@arena/shared';
import { Heart, Droplet, Wind, Swords, Sparkles, ShoppingBag } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCosmeticsStore } from '../store/useCosmeticsStore';
import { useSidebarStore } from './hud/sidebar/useSidebarStore';
import { ClassPreview } from './ClassPreview';
import { AvatarFrame } from './AvatarFrame';
import { abilityIcon } from './abilityIcons';
import { rimColorOf } from './rim';
import { Button, LevelBadge, Meter, StatTile } from './primitives';
import { STAT_COLORS } from './theme';

/** The four class stats we surface as bars, each normalized against the biggest
 *  value of that stat across all classes so the bars read comparatively. */
const STAT_BARS = [
  { key: 'health', label: 'Health', icon: Heart, color: STAT_COLORS.positive },
  { key: 'mana', label: 'Mana', icon: Droplet, color: STAT_COLORS.mana },
  { key: 'moveSpeed', label: 'Speed', icon: Wind, color: STAT_COLORS.cast },
  { key: 'attackDamage', label: 'Power', icon: Swords, color: STAT_COLORS.negative },
] as const;

/** Max of each stat across every class — the denominator for the comparative bars. */
const STAT_MAX = STAT_BARS.reduce(
  (acc, { key }) => {
    acc[key] = Math.max(...Object.values(CLASS_DEFINITIONS).map((d) => d.stats[key]));
    return acc;
  },
  {} as Record<(typeof STAT_BARS)[number]['key'], number>,
);

/**
 * The player's own "paperdoll" character sheet — a read-only overview of the
 * champion you're currently playing: 3D portrait + identity, the class stat
 * profile, the QWER ability kit, your lifetime record, and a jump into the
 * wardrobe. Opened from the champion portrait at the top of the town rail. The
 * panel chrome (surface + header + close) is supplied by the host wrapper.
 */
export function CharacterSheet() {
  const sessionId = useGameStore((s) => s.sessionId);
  useGameStore((s) => s.tick); // track live level / XP from the server
  const username = useAuthStore((s) => s.username);
  const progress = useAuthStore((s) => s.progress);
  const byClass = useCosmeticsStore((s) => s.byClass);

  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  if (!me) return null;

  const characterClass: CharacterClass = me.characterClass;
  const def = getClassDefinition(characterClass);
  const record = progress.find((p) => p.characterClass === characterClass);
  const title = me.titleId ? getCosmeticOfType(me.titleId, 'title') : undefined;
  const rimColor = rimColorOf(me.rimId);
  const { span, into } = xpProgress(me.level, me.xp);

  const kills = record?.kills ?? me.kills;
  const deaths = record?.deaths ?? me.deaths;
  const wins = record?.wins ?? 0;
  const losses = record?.losses ?? 0;
  const kd = deaths === 0 ? kills.toFixed(2) : (kills / deaths).toFixed(2);
  const games = wins + losses;
  const winRate = games === 0 ? '—' : `${Math.round((wins / games) * 100)}%`;

  const owned = classCosmeticsOf(byClass, characterClass).owned;
  const claimable = claimableCount(owned, characterClass, me.level);
  const openWardrobe = () => useSidebarStore.getState().open('store');

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-px md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      {/* Left — 3D portrait, identity + XP, framed by the equipped rim. */}
      <div className="p-3">
        <AvatarFrame rimId={me.rimId} shape="panel" size="md" className="min-h-[320px]">
          <ClassPreview
            characterClass={characterClass}
            skinId={me.skinId}
            dyeId={me.dyeId}
            pedestalId={me.pedestalId}
            weaponId={me.weaponId}
            enchantId={me.enchantId}
            spin={false}
          />
          <div className="pointer-events-none absolute right-3 top-2 text-[10px] uppercase tracking-[0.2em] text-white/30">
            drag to rotate
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/40 to-transparent p-4">
            <div className="flex items-center gap-3">
              <LevelBadge level={me.level} size="md" color={rimColor} className="shrink-0" />
              <div className="min-w-0">
                {title && (
                  <div
                    className="truncate text-[11px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: title.color, textShadow: `0 0 8px ${title.color}66` }}
                  >
                    {title.text}
                  </div>
                )}
                <div className="truncate text-xl font-semibold tracking-wide text-white">
                  {username ?? me.name}
                </div>
                <div className="truncate text-xs text-muted">
                  {def.name} · {def.role}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <Meter
                layout="stacked"
                size="md"
                value={into}
                max={span}
                fill={`linear-gradient(90deg, var(--color-gold-dark), ${STAT_COLORS.xpTip})`}
                label="XP"
                valueText={`${Math.round(into)} / ${span}`}
                labelClassName="text-[10px] uppercase tracking-wide text-white/70"
                valueClassName="text-[10px] text-white/60"
                trackClassName="bg-white/15 ring-1 ring-inset ring-white/10"
                className="flex flex-col gap-1"
              />
            </div>
          </div>
        </AvatarFrame>
      </div>

      {/* Right — stat profile, ability kit, record, wardrobe CTA. */}
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-4">
        {/* Class stat profile */}
        <section>
          <SheetLabel>Class Profile</SheetLabel>
          <div className="mt-3 flex flex-col gap-2.5">
            {STAT_BARS.map(({ key, label, icon: Icon, color }) => (
              <Meter
                key={key}
                layout="inline"
                size="sm"
                value={def.stats[key]}
                max={STAT_MAX[key]}
                fill={color}
                label={
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <Icon size={12} aria-hidden /> {label}
                  </span>
                }
                valueText={def.stats[key]}
                valueClassName="text-[11px] tabular-nums text-text"
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
            <span className="uppercase tracking-wide">Difficulty</span>
            <span className="flex gap-1">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={`h-1.5 w-4 rounded-full ${n <= def.stats.difficulty ? 'bg-gold' : 'bg-white/15'}`}
                />
              ))}
            </span>
          </div>
        </section>

        {/* Ability kit */}
        <section>
          <SheetLabel>Abilities</SheetLabel>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {ABILITY_SLOTS.map((slot) => {
              const kind = CLASS_LOADOUTS[characterClass][slot];
              if (!kind) return null;
              return <AbilityCell key={slot} slot={slot} kind={kind} />;
            })}
          </div>
        </section>

        {/* Lifetime record */}
        <section>
          <SheetLabel>Record</SheetLabel>
          <div className="mt-3 flex gap-2">
            <StatTile variant="bordered" label="Kills" value={kills} color={STAT_COLORS.positive} />
            <StatTile
              variant="bordered"
              label="Deaths"
              value={deaths}
              color={STAT_COLORS.negative}
            />
            <StatTile variant="bordered" label="K/D" value={kd} color={STAT_COLORS.text} />
          </div>
          <div className="mt-2 flex gap-2">
            <StatTile variant="bordered" label="Wins" value={wins} color={STAT_COLORS.positive} />
            <StatTile
              variant="bordered"
              label="Losses"
              value={losses}
              color={STAT_COLORS.negative}
            />
            <StatTile variant="bordered" label="Win %" value={winRate} color={STAT_COLORS.text} />
          </div>
        </section>

        {/* Wardrobe jump */}
        <Button
          variant="goldCta"
          size="md"
          onClick={openWardrobe}
          className="mt-auto w-full justify-center gap-2"
        >
          {claimable > 0 ? <Sparkles size={15} aria-hidden /> : <ShoppingBag size={15} aria-hidden />}
          {claimable > 0 ? `Customize · ${claimable} to unlock` : 'Customize'}
        </Button>
      </div>
    </div>
  );
}

/** A small gold section label for the sheet's right column. */
function SheetLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-gold/80">
      <span className="h-px w-5 bg-linear-to-r from-gold/70 to-transparent" />
      {children}
    </h3>
  );
}

/** One QWER ability: slot key + glyph + name, with a stats tooltip on hover. */
function AbilityCell({ slot, kind }: { slot: string; kind: AbilityKind }) {
  const def = ABILITIES[kind];
  const Icon = abilityIcon(kind);
  const tip = describeAbility(def);
  const cd = (def.cooldownMs / 1000).toFixed(1).replace(/\.0$/, '');
  const title = `${tip.name} — ${tip.aimLabel}\nCooldown ${cd}s · ${def.manaCost} mana${
    def.range ? ` · range ${def.range}` : ''
  }\n\n${tip.lines.join('\n')}`;
  return (
    <div
      title={title}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-panel/40 p-2 text-center transition hover:border-white/20"
    >
      <div className="relative grid h-11 w-11 place-items-center rounded-lg bg-black/30 text-gold">
        <Icon size={20} aria-hidden />
        <span className="absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded bg-gold text-[10px] font-bold leading-none text-black">
          {slot}
        </span>
      </div>
      <span className="w-full truncate text-[11px] font-medium text-text">{def.name}</span>
    </div>
  );
}
