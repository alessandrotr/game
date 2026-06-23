import { Shuffle } from 'lucide-react';
import { PERKS, type PerkId } from '@arena/shared';
import { usePerkStore } from '../store/usePerkStore';
import { useGameStore } from '../store/useGameStore';
import { sendPerkPick } from '../network/colyseus';
import { resolvePerkIcon } from './perkIcons';

const TIER_COMMON = { border: '#9ca3af', glow: 'rgba(156,163,175,0.35)', bg: 'rgba(156,163,175,0.12)', label: 'Common' };

/** Tier → border/glow color map. */
const TIER_COLORS: Record<string, { border: string; glow: string; bg: string; label: string }> = {
  common: TIER_COMMON,
  rare: { border: '#60a5fa', glow: 'rgba(96,165,250,0.45)', bg: 'rgba(96,165,250,0.12)', label: 'Rare' },
  legendary: { border: '#fbbf24', glow: 'rgba(251,191,36,0.5)', bg: 'rgba(251,191,36,0.14)', label: 'Legendary' },
};

/**
 * Perk picker: slides up over the ability bar when the server sends a
 * PerkOffer. For fresh picks (waves 3–5): two visible perks + mystery jolly.
 * For upgrades (waves 6+): the player's upgradeable perks shown as "from → to"
 * cards, plus the mystery jolly.
 */
export function PerkPicker() {
  const offer = usePerkStore((s) => s.offer);
  const zombieMode = useGameStore((s) => s.zombieMode);
  const gunMode = useGameStore((s) => s.gunMode);

  if (!offer || !zombieMode || gunMode) return null;

  const pick = (slot: number, target?: PerkId) => {
    sendPerkPick(slot, target);
    usePerkStore.getState().clearOffer();
  };

  if (!offer.isUpgrade) {
    // ── Fresh pick mode (waves 3–5) ──
    const perkA = offer.visible[0] ? PERKS[offer.visible[0]] : null;
    const perkB = offer.visible[1] ? PERKS[offer.visible[1]] : null;
    const perkC = offer.visible[2] ? PERKS[offer.visible[2]] : null;
    return (
      <div className="pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-300 flex flex-col items-center gap-3 pb-4">
        <span className="text-sm font-bold uppercase tracking-wider text-white/70">Choose a Perk</span>
        <div className="flex items-stretch gap-4">
          {perkA && <PerkCard perk={perkA} onClick={() => pick(0)} />}
          {perkB && <PerkCard perk={perkB} onClick={() => pick(1)} />}
          {perkC && <PerkCard perk={perkC} onClick={() => pick(2)} />}
          <JollyCard onClick={() => pick(3)} />
        </div>
      </div>
    );
  }

  // ── Upgrade mode (waves 6+) ──
  // Show the player's upgradeable perks directly as "from → to" cards.
  return (
    <div className="pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-300 flex flex-col items-center gap-3 pb-4">
      <span className="text-sm font-bold uppercase tracking-wider text-white/70">Upgrade a Perk</span>
      <div className="flex items-stretch gap-4">
        <UpgradeSelectList offer={offer} onSelect={(id) => pick(0, id)} />
      </div>
    </div>
  );
}

/** A single perk card in the picker (for fresh-pick mode). */
function PerkCard({ perk, onClick }: { perk: (typeof PERKS)[PerkId]; onClick: () => void }) {
  const colors = TIER_COLORS[perk.tier] ?? TIER_COMMON;
  const Icon = resolvePerkIcon(perk.icon);
  return (
    <button
      onClick={onClick}
      className="group relative flex w-[160px] cursor-pointer flex-col items-center gap-2 rounded-xl border bg-black/70 px-4 py-4 backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/80"
      style={{
        borderColor: colors.border,
        boxShadow: `0 0 16px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg"
        style={{ background: colors.bg }}
      >
        <Icon size={26} style={{ color: colors.border }} />
      </div>
      <span className="text-sm font-bold text-white">{perk.name}</span>
      <span className="text-center text-[11px] leading-snug text-white/60">{perk.description}</span>
      <span
        className="mt-auto text-[10px] font-bold uppercase tracking-wider"
        style={{ color: colors.border }}
      >
        {colors.label}
      </span>
    </button>
  );
}

/** A fixed upgrade card (shows "from → to"). */
function UpgradeCard({
  from,
  to,
  onClick,
}: {
  from: (typeof PERKS)[PerkId];
  to: (typeof PERKS)[PerkId];
  onClick: () => void;
}) {
  const toColors = TIER_COLORS[to.tier] ?? TIER_COMMON;
  const ToIcon = resolvePerkIcon(to.icon);
  return (
    <button
      onClick={onClick}
      className="group relative flex w-[160px] cursor-pointer flex-col items-center gap-2 rounded-xl border bg-black/70 px-4 py-4 backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/80"
      style={{
        borderColor: toColors.border,
        boxShadow: `0 0 16px ${toColors.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg"
        style={{ background: toColors.bg }}
      >
        <ToIcon size={26} style={{ color: toColors.border }} />
      </div>
      <span className="text-[10px] text-white/50 line-through">{from.name}</span>
      <span className="text-sm font-bold text-white">{to.name}</span>
      <span className="text-center text-[11px] leading-snug text-white/60">{to.description}</span>
      <span
        className="mt-auto text-[10px] font-bold uppercase tracking-wider"
        style={{ color: toColors.border }}
      >
        {TIER_COLORS[to.tier]?.label ?? 'Upgrade'}
      </span>
    </button>
  );
}

/** Mystery "jolly" card — the server picks a random perk for the player. */
function JollyCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex w-[160px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border border-purple-500/50 bg-black/70 px-4 py-4 backdrop-blur-sm transition-all hover:scale-105 hover:border-purple-400/70 hover:bg-black/80"
      style={{
        boxShadow: '0 0 18px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/15">
        <Shuffle size={26} className="text-purple-400" />
      </div>
      <span className="text-sm font-bold text-purple-300">Mystery</span>
      <span className="text-center text-[11px] leading-snug text-white/50">Random perk — feeling lucky?</span>
    </button>
  );
}

/** Sub-view: list the player's current perks so they can pick which one to upgrade. */
function UpgradeSelectList({
  offer,
  onSelect,
}: {
  offer: { visible: PerkId[] };
  onSelect: (id: PerkId) => void;
}) {
  const sessionId = useGameStore((s) => s.sessionId);
  const players = useGameStore((s) => s.players);
  const me = sessionId ? players.get(sessionId) : undefined;
  if (!me) return null;

  const perkIds = [me.perk1, me.perk2, me.perk3].filter((id): id is PerkId => !!id && id in PERKS);
  const targetTier = offer.visible[0] ? PERKS[offer.visible[0]].tier : undefined;
  const upgradeable = targetTier
    ? perkIds.filter((id) => PERKS[id].tier === targetTier && PERKS[id].upgradesTo)
    : [];

  if (upgradeable.length === 0) {
    return <span className="text-sm text-white/50">No upgradeable perks</span>;
  }

  return (
    <>
      {upgradeable.map((id) => {
        const perk = PERKS[id];
        const next = perk.upgradesTo ? PERKS[perk.upgradesTo] : null;
        if (!next) return null;
        return (
          <UpgradeCard key={id} from={perk} to={next} onClick={() => onSelect(id)} />
        );
      })}
    </>
  );
}
