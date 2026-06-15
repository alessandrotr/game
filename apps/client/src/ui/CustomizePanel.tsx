import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  Check,
  ChevronRight,
  Eye,
  Footprints,
  Lock,
  ShoppingBag,
  Smile,
  Sparkles,
  Tag,
  User,
  X,
} from 'lucide-react';
import {
  COSMETICS,
  MAX_EMOTE_SLOTS,
  claimableCount,
  classCosmeticsOf,
  cosmeticsOfType,
  getClassDefinition,
  getCosmetic,
  getCosmeticOfType,
  isUnlocked,
  requiredLevelFor,
  xpProgress,
  type AnimationName,
  type CharacterClass,
  type Cosmetic,
  type CosmeticRarity,
  type CosmeticType,
  type Loadout,
  type PedestalEffect,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useCosmeticsStore, equipSkin } from '../store/useCosmeticsStore';
import { useCustomizeStore, type CustomizeTab } from '../store/useCustomizeStore';
import { ClassPreview } from './ClassPreview';
import { registerPedestalThumb, setPedestalThumbHover, type PedestalThumbHandle } from '../render/pedestalThumbnails';
import {
  EmoteThumbStage,
  registerEmoteThumb,
  setEmoteThumbHover,
  type EmoteThumbHandle,
} from '../render/emoteThumbnails';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  IconButton,
  LevelBadge,
  Meter,
} from './primitives';
import { STAT_COLORS } from './theme';

// ---------------------------------------------------------------------------
// Rarity system — one source of truth for the accent + sort weight.
// ---------------------------------------------------------------------------

const RARITY: Record<CosmeticRarity, string> = {
  common: '#9aa3b8',
  rare: '#4a8bff',
  epic: '#9a6cff',
  legendary: '#e8b24a',
};
/** Icon per cosmetic type (used on swatches + category headers). */
const TYPE_ICON: Record<CosmeticType, typeof Tag> = {
  skin: User,
  dye: Sparkles,
  pedestal: Footprints,
  emote: Smile,
  title: Tag,
};

/** The display color a cosmetic "is" (its own color, or its rarity accent). */
function colorOf(c: Cosmetic): string {
  // Only items that *are* a color carry one (pedestals/dyes/skins). Emotes and
  // titles stay neutral so the grid doesn't turn into a rainbow — their rarity
  // reads from the small dot/label instead.
  if (c.type === 'dye' || c.type === 'pedestal') return c.color;
  return '#9aa3b8';
}

/** Category display metadata, in store order. */
const CATEGORIES: { type: CosmeticType; label: string; icon: typeof Tag }[] = [
  { type: 'pedestal', label: 'Pedestals', icon: Footprints },
  { type: 'emote', label: 'Emotes', icon: Smile },
  { type: 'title', label: 'Titles', icon: Tag },
];

// ---------------------------------------------------------------------------
// Equip helpers (everything is scoped to a single class' wardrobe)
// ---------------------------------------------------------------------------

function isEquipped(c: Cosmetic, loadout: Loadout): boolean {
  switch (c.type) {
    case 'skin':
      return loadout.skinId === c.id;
    case 'dye':
      return loadout.dyeId === c.id;
    case 'pedestal':
      return loadout.pedestalId === c.id;
    case 'title':
      return loadout.titleId === c.id;
    case 'emote':
      return loadout.emotes.includes(c.id);
  }
}

/** Equip (or, for emotes, toggle the key binding of) an owned cosmetic for a class. */
function equipCosmetic(characterClass: CharacterClass, c: Cosmetic): void {
  const store = useCosmeticsStore.getState();
  const loadout = store.loadoutFor(characterClass);
  const on = isEquipped(c, loadout);
  switch (c.type) {
    case 'skin':
      equipSkin(characterClass, on ? '' : c.id);
      break;
    case 'dye':
      store.equip(characterClass, { dyeId: on ? '' : c.id });
      break;
    case 'pedestal':
      store.equip(characterClass, { pedestalId: on ? '' : c.id });
      break;
    case 'title':
      store.equip(characterClass, { titleId: on ? '' : c.id });
      break;
    case 'emote': {
      const bound = loadout.emotes;
      const next = bound.includes(c.id)
        ? bound.filter((id) => id !== c.id)
        : bound.length < MAX_EMOTE_SLOTS
          ? [...bound, c.id]
          : bound;
      store.equip(characterClass, { emotes: next });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Swatch — the visual stand-in for an item (pedestal ring / title tag / emote).
// ---------------------------------------------------------------------------

function Swatch({ c, size = 44 }: { c: Cosmetic; size?: number }) {
  const color = colorOf(c);
  const Icon = TYPE_ICON[c.type];
  if (c.type === 'pedestal') {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-xl border border-white/10 bg-[#0c0e16]"
        style={{ width: size, height: size }}
      >
        <span
          className="rounded-full"
          style={{
            width: size * 0.5,
            height: size * 0.5,
            boxShadow: `0 0 0 3px ${color}, 0 0 ${size * 0.3}px ${color}aa`,
          }}
        />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl border border-white/10"
      style={{ width: size, height: size, background: `${color}1f` }}
    >
      <Icon size={size * 0.42} style={{ color }} aria-hidden />
    </span>
  );
}

/** Default pedestal color when nothing is equipped (matches the in-scene default). */
const DEFAULT_PEDESTAL_COLOR = '#8b91a8';

/** A `<canvas>` DOM child driven by the shared offscreen WebGL renderer (one
 *  context for the whole store). Scrolls with its card; same shader as the big
 *  showcase. */
function PedestalCanvas({
  effect,
  color,
  color2,
  hovered = false,
}: {
  effect: PedestalEffect;
  color: string;
  color2?: string;
  /** Driven by the parent card — animates while true, static frame otherwise. */
  hovered?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const handle = useRef<PedestalThumbHandle | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    const h: PedestalThumbHandle = { canvas, effect, color, color2 };
    handle.current = h;
    const stop = registerPedestalThumb(h);
    return () => {
      ro.disconnect();
      stop();
      handle.current = null;
    };
  }, [effect, color, color2]);
  // Animate only while the card is hovered; otherwise hold a static frame (the
  // shared render loop pauses entirely when nothing is hovered).
  useEffect(() => {
    if (handle.current) setPedestalThumbHover(handle.current, hovered);
  }, [hovered]);
  return <canvas ref={ref} className="block h-full w-full" />;
}

/** Real 3D pedestal thumbnail for a catalog item. */
function PedestalThumb({ c, hovered }: { c: Cosmetic & { type: 'pedestal' }; hovered?: boolean }) {
  return <PedestalCanvas effect={c.effect ?? 'ring'} color={c.color} color2={c.color2} hovered={hovered} />;
}

/** Emote thumbnail — the class character performing the emote while hovered (idle
 *  otherwise), mirroring the pedestals' hover-to-play. Just a 2D canvas the shared
 *  {@link EmoteThumbStage} blits into, so any number of emotes cost one WebGL
 *  context total (not one per card). The stage owns the class/model. */
function EmoteThumb({ anim, hovered }: { anim: AnimationName; hovered: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const handle = useRef<EmoteThumbHandle | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const h: EmoteThumbHandle = { canvas: ref.current, anim };
    handle.current = h;
    return registerEmoteThumb(h);
  }, [anim]);

  useEffect(() => {
    if (handle.current) setEmoteThumbHover(handle.current, hovered);
  }, [hovered]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

/** Title thumbnail — a mini nameplate preview showing how the title reads above
 *  your name in-game (colored title over the player name + a hint of HP bar). */
function TitleThumb({ c }: { c: Cosmetic & { type: 'title' } }) {
  const username = useAuthStore((s) => s.username) ?? 'Adventurer';
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 text-center">
      <span
        className="truncate text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: c.color, textShadow: `0 0 8px ${c.color}66` }}
      >
        {c.text}
      </span>
      <span className="max-w-full truncate text-sm font-semibold tracking-wide text-white">
        {username}
      </span>
      {/* A sliver of health bar to evoke the in-world nameplate. */}
      <span className="mt-1 h-1 w-14 rounded-full bg-positive/80" />
    </div>
  );
}

/** Modern rarity chip — a gradient pill tinted by the rarity color, with a soft
 *  glow + bevel. Reads instantly without turning the card into a rainbow. */
function RarityTag({ rarity }: { rarity: CosmeticRarity }) {
  const c = RARITY[rarity];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.12em] backdrop-blur-sm"
      style={{
        color: `color-mix(in srgb, ${c} 75%, #ffffff)`,
        borderColor: `${c}66`,
        background: `linear-gradient(135deg, ${c}40, ${c}12)`,
        boxShadow: `0 0 10px ${c}40, inset 0 1px 0 ${c}33`,
        textShadow: `0 0 6px ${c}66`,
      }}
    >
      {rarity}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** The CTA verb + style for an item's current state (level-gated). */
function cardAction(c: Cosmetic, owned: boolean, equipped: boolean, loadout: Loadout, level: number) {
  if (!owned) {
    // Locked until the class reaches the required level.
    if (!isUnlocked(c, level)) {
      return { label: `Lv ${requiredLevelFor(c)}`, variant: 'panel' as const, icon: Lock, disabled: true };
    }
    return { label: 'Unlock', variant: 'goldCta' as const, icon: Sparkles, disabled: false };
  }
  if (c.type === 'emote') {
    return equipped
      ? {
          label: `Key ${loadout.emotes.indexOf(c.id) + 1}`,
          variant: 'goldOutline' as const,
          icon: Check,
          disabled: false,
        }
      : { label: 'Bind', variant: 'panel' as const, icon: undefined, disabled: false };
  }
  return equipped
    ? { label: 'Equipped', variant: 'goldOutline' as const, icon: Check, disabled: true }
    : { label: 'Equip', variant: 'panel' as const, icon: undefined, disabled: false };
}

/** A calm storefront card: neutral frame, quiet rarity tag, single CTA. The
 *  only strong color is the item's own (a pedestal's hue); state reads from the
 *  badge + gold equipped ring, not a per-rarity wash. */
function StoreCard({
  c,
  characterClass,
  level,
}: {
  c: Cosmetic;
  characterClass: CharacterClass;
  level: number;
}) {
  const owned = useCosmeticsStore((s) =>
    classCosmeticsOf(s.byClass, characterClass).owned.includes(c.id),
  );
  const loadout = useCosmeticsStore((s) => classCosmeticsOf(s.byClass, characterClass).loadout);
  const previewing = useCustomizeStore((s) => s.previewId === c.id);
  const equipped = isEquipped(c, loadout);
  const locked = !owned && !isUnlocked(c, level);
  const act = cardAction(c, owned, equipped, loadout, level);
  const [hovered, setHovered] = useState(false);
  // Clicking the card previews it on the avatar (owned or not). The button (which
  // stops propagation) unlocks/equips — equip needs ownership, unlock needs level.
  const preview = () => useCustomizeStore.getState().setPreview(c.id);
  const onAction = (e: MouseEvent) => {
    e.stopPropagation();
    if (owned) equipCosmetic(characterClass, c);
    else if (!locked) useCosmeticsStore.getState().unlock(characterClass, c.id);
    preview();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={preview}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          preview();
        }
      }}
      aria-pressed={previewing}
      title={`Preview ${c.name}`}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-panel/40 text-left transition hover:-translate-y-0.5 ${
        previewing ? 'border-white/40' : 'border-white/10 hover:border-white/20'
      }`}
    >
      <div className="relative grid h-24 place-items-center bg-black/20">
        <div className={`h-full w-full ${locked ? 'opacity-40 grayscale' : ''}`}>
          {c.type === 'pedestal' ? (
            <PedestalThumb c={c} hovered={hovered && !locked} />
          ) : c.type === 'title' ? (
            <div className="grid h-full place-items-center">
              <TitleThumb c={c} />
            </div>
          ) : c.type === 'emote' ? (
            <EmoteThumb anim={c.anim} hovered={hovered && !locked} />
          ) : (
            <div className="grid h-full place-items-center">
              <Swatch c={c} size={52} />
            </div>
          )}
        </div>
        {/* Rarity tag — bottom-left of the thumbnail. */}
        <span className="absolute bottom-2 left-2">
          <RarityTag rarity={c.rarity} />
        </span>
        {locked ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/70 backdrop-blur-sm">
            <Lock size={10} /> Lv {requiredLevelFor(c)}
          </span>
        ) : equipped ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
            <Check size={10} /> Equipped
          </span>
        ) : (
          previewing && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur-sm">
              <Eye size={10} /> Preview
            </span>
          )
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <span className="truncate text-sm font-semibold text-text">{c.name}</span>
        <p className="mb-1 line-clamp-2 min-h-8 text-[11px] leading-snug text-muted">
          {c.description}
        </p>
        <Button
          variant={act.variant}
          size="sm"
          onClick={onAction}
          disabled={act.disabled}
          className="mt-auto w-full gap-1.5"
        >
          {act.icon && <act.icon size={13} />} {act.label}
        </Button>
      </div>
    </div>
  );
}

/** A labelled category block: an obvious header (icon + name + owned/total) over
 *  that category's card grid. This is the primary structure of the store. */
function CategorySection({
  type,
  label,
  icon: Icon,
  characterClass,
  level,
}: {
  type: CosmeticType;
  label: string;
  icon: typeof Tag;
  characterClass: CharacterClass;
  level: number;
}) {
  const items = cosmeticsOfType(type);
  const ownedHere = useCosmeticsStore(
    (s) =>
      items.filter((c) => classCosmeticsOf(s.byClass, characterClass).owned.includes(c.id)).length,
  );
  if (items.length === 0) return null;
  return (
    <section className="mb-6 last:mb-0">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold/10 text-gold">
          <Icon size={15} aria-hidden />
        </span>
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-text">
          {label}
        </h3>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-muted">
          {ownedHere}/{items.length}
        </span>
        <span className="h-px flex-1 bg-linear-to-r from-white/12 to-transparent" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((c) => (
          <StoreCard key={c.id} c={c} characterClass={characterClass} level={level} />
        ))}
      </div>
    </section>
  );
}

type StoreFilter = 'all' | CosmeticType;

/** Tab content: the storefront — a category filter over clearly-labelled
 *  category sections. "All" shows every section stacked; a filter narrows to one. */
function StoreContent({ characterClass }: { characterClass: CharacterClass }) {
  const [filter, setFilter] = useState<StoreFilter>('all');
  const ownedCount = useCosmeticsStore(
    (s) =>
      classCosmeticsOf(s.byClass, characterClass).owned.filter((id) =>
        COSMETICS.some((c) => c.id === id),
      ).length,
  );
  // This class's level gates what can be unlocked (live value if playing it,
  // else the persisted per-class level).
  const progress = useAuthStore((s) => s.progress);
  const sessionId = useGameStore((s) => s.sessionId);
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  const level =
    (me?.characterClass === characterClass ? me.level : undefined) ??
    progress.find((p) => p.characterClass === characterClass)?.level ??
    1;
  const shown = filter === 'all' ? CATEGORIES : CATEGORIES.filter((cat) => cat.type === filter);

  return (
    // h-full so this fills its (full-height) grid cell — otherwise the flex-1
    // scroll/canvas wrapper below has no height to flex into and collapses.
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-2.5">
        <div className="flex gap-1">
          <FilterChip
            active={filter === 'all'}
            label="All"
            count={COSMETICS.length}
            onClick={() => setFilter('all')}
          />
          {CATEGORIES.map((cat) => (
            <FilterChip
              key={cat.type}
              active={filter === cat.type}
              label={cat.label}
              count={cosmeticsOfType(cat.type).length}
              onClick={() => setFilter(cat.type)}
            />
          ))}
        </div>
        <span className="ml-auto text-[11px] text-muted">
          <span className="font-semibold text-text">{ownedCount}</span> / {COSMETICS.length}{' '}
          unlocked
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {shown.map((cat) => (
          <CategorySection
            key={cat.type}
            type={cat.type}
            label={cat.label}
            icon={cat.icon}
            characterClass={characterClass}
            level={level}
          />
        ))}
      </div>
    </div>
  );
}

/** A store category filter chip. */
function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-2.5 py-1 text-xs transition ${
        active ? 'bg-gold/15 font-semibold text-gold' : 'text-muted hover:text-text'
      }`}
    >
      {label} <span className="opacity-50">{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Customize — the loadout editor (owned items only)
// ---------------------------------------------------------------------------

/** A selectable owned-item card in a slot — same rich thumbnail as the store
 *  (3D pedestal / nameplate title / icon), selected state via a check pill. */
function OptionTile({ c, characterClass }: { c: Cosmetic; characterClass: CharacterClass }) {
  const loadout = useCosmeticsStore((s) => classCosmeticsOf(s.byClass, characterClass).loadout);
  const equipped = isEquipped(c, loadout);
  const slot = c.type === 'emote' ? loadout.emotes.indexOf(c.id) + 1 : 0;
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={() => equipCosmetic(characterClass, c)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      aria-pressed={equipped}
      title={`${c.name} · ${c.rarity}`}
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-panel/40 text-left transition hover:-translate-y-0.5 ${
        equipped ? 'border-gold/50' : 'border-white/10 hover:border-white/20'
      }`}
    >
      <div className="relative grid h-16 place-items-center bg-black/20">
        {c.type === 'pedestal' ? (
          <PedestalThumb c={c} hovered={hovered} />
        ) : c.type === 'title' ? (
          <TitleThumb c={c} />
        ) : c.type === 'emote' ? (
          <EmoteThumb anim={c.anim} hovered={hovered} />
        ) : (
          <Swatch c={c} size={40} />
        )}
        {equipped && c.type !== 'emote' && (
          <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-gold text-black">
            <Check size={11} />
          </span>
        )}
        {c.type === 'emote' && equipped && (
          <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded bg-gold text-[10px] font-bold text-black">
            {slot}
          </span>
        )}
      </div>
      <span className="truncate px-2 py-1.5 text-[12px] font-medium text-text">{c.name}</span>
    </button>
  );
}

/** The default (un-equipped) pedestal — the neutral gray ring every character
 *  starts with. Selecting it clears the equipped pedestal back to default. */
function DefaultPedestalTile({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onSelect}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      aria-pressed={active}
      title="Default pedestal"
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-panel/40 text-left transition hover:-translate-y-0.5 ${
        active ? 'border-gold/50' : 'border-white/10 hover:border-white/20'
      }`}
    >
      <div className="relative grid h-16 place-items-center bg-black/20">
        <PedestalCanvas effect="ring" color={DEFAULT_PEDESTAL_COLOR} hovered={hovered} />
        {active && (
          <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-gold text-black">
            <Check size={11} />
          </span>
        )}
      </div>
      <span className="truncate px-2 py-1.5 text-[12px] font-medium text-text">Default</span>
    </button>
  );
}

/** Section header with the slot name + a "browse store" affordance. */
function SlotHeader({
  title,
  icon: Icon,
  onBrowse,
}: {
  title: string;
  icon: typeof Tag;
  onBrowse: () => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon size={14} className="text-gold/70" aria-hidden />
      <span className="font-display text-[11px] uppercase tracking-[0.2em] text-gold/80">
        {title}
      </span>
      <span className="h-px flex-1 bg-linear-to-r from-gold/20 to-transparent" />
      <button
        type="button"
        onClick={onBrowse}
        className="flex items-center gap-0.5 text-[11px] text-muted transition hover:text-gold"
      >
        Store <ChevronRight size={12} />
      </button>
    </div>
  );
}

function EmptySlot({ onBrowse }: { onBrowse: () => void }) {
  return (
    <button
      type="button"
      onClick={onBrowse}
      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-black/20 px-3 py-3 text-[12px] text-muted transition hover:border-gold/40 hover:text-gold"
    >
      <ShoppingBag size={13} /> Unlock some in the Store
    </button>
  );
}

/**
 * One single-select slot. Pedestal leads with a "Default" tile (the gray ring —
 * its un-equipped state); title has no default tile since every character always
 * has a title equipped (starting Novice).
 */
function SingleSlot({
  title,
  icon,
  type,
  characterClass,
  equippedId,
  onClear,
  onBrowse,
}: {
  title: string;
  icon: typeof Tag;
  type: 'pedestal' | 'title';
  characterClass: CharacterClass;
  equippedId: string;
  onClear: () => void;
  onBrowse: () => void;
}) {
  const owned = useCosmeticsStore((s) => classCosmeticsOf(s.byClass, characterClass).owned);
  const items = cosmeticsOfType(type).filter((c) => owned.includes(c.id));
  const withDefault = type === 'pedestal';
  return (
    <section className="mb-5">
      <SlotHeader title={title} icon={icon} onBrowse={onBrowse} />
      {items.length === 0 && !withDefault ? (
        <EmptySlot onBrowse={onBrowse} />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {withDefault && <DefaultPedestalTile active={!equippedId} onSelect={onClear} />}
          {items.map((c) => (
            <OptionTile key={c.id} c={c} characterClass={characterClass} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared left showcase (avatar + identity) — same across all tabs.
// ---------------------------------------------------------------------------

function Showcase({ characterClass }: { characterClass: CharacterClass }) {
  const username = useAuthStore((s) => s.username);
  const progress = useAuthStore((s) => s.progress);
  const loadout = useCosmeticsStore((s) => classCosmeticsOf(s.byClass, characterClass).loadout);
  const previewId = useCustomizeStore((s) => s.previewId);
  const def = getClassDefinition(characterClass);

  // A previewed cosmetic overrides its slot on the avatar (try-before-equip),
  // without touching the equipped/persisted loadout.
  const preview = previewId ? getCosmetic(previewId) : undefined;
  const skinId = preview?.type === 'skin' ? preview.id : loadout.skinId;
  const dyeId = preview?.type === 'dye' ? preview.id : loadout.dyeId;
  const pedestalId = preview?.type === 'pedestal' ? preview.id : loadout.pedestalId;
  const titleId = preview?.type === 'title' ? preview.id : loadout.titleId;
  const title = titleId ? getCosmeticOfType(titleId, 'title') : undefined;
  // Previewing (clicking) an emote makes the showcase character perform it.
  const animation: AnimationName = preview?.type === 'emote' ? (preview.anim as AnimationName) : 'idle';

  // Level + XP — overlaid on the canvas next to / below the name (both tabs).
  const sessionId = useGameStore.getState().sessionId;
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  const record = progress.find((p) => p.characterClass === characterClass);
  const level = me?.level ?? record?.level ?? 1;
  const { span, into } = xpProgress(level, me?.xp ?? record?.xp ?? 0);

  return (
    <div className="relative min-h-[300px] overflow-hidden border-b border-white/5 bg-linear-to-b from-black/30 to-black/55 md:border-b-0 md:border-r">
      <ClassPreview
        characterClass={characterClass}
        skinId={skinId}
        dyeId={dyeId}
        pedestalId={pedestalId}
        animation={animation}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/40 to-transparent p-4">
        {preview && (
          <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur-sm">
            Previewing
          </div>
        )}
        <div className="flex items-center gap-3">
          <LevelBadge level={level} size="md" className="shrink-0" />
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
              {username ?? 'Adventurer'}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customize — the loadout editor for the current class (owned items only)
// ---------------------------------------------------------------------------

function CustomizeContent({ characterClass }: { characterClass: CharacterClass }) {
  const loadout = useCosmeticsStore((s) => classCosmeticsOf(s.byClass, characterClass).loadout);
  const owned = useCosmeticsStore((s) => classCosmeticsOf(s.byClass, characterClass).owned);
  const setTab = useCustomizeStore((s) => s.setTab);
  const browse = () => setTab('store');
  const clearSlot = (patch: Partial<Loadout>) =>
    useCosmeticsStore.getState().equip(characterClass, patch);

  const ownedEmotes = cosmeticsOfType('emote').filter((c) => owned.includes(c.id));

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <SingleSlot
        title="Pedestal"
        icon={Footprints}
        type="pedestal"
        characterClass={characterClass}
        equippedId={loadout.pedestalId}
        onClear={() => clearSlot({ pedestalId: '' })}
        onBrowse={browse}
      />
      <SingleSlot
        title="Title"
        icon={Tag}
        type="title"
        characterClass={characterClass}
        equippedId={loadout.titleId}
        onClear={() => clearSlot({ titleId: '' })}
        onBrowse={browse}
      />
      <section>
        <SlotHeader title={`Emotes · keys 1–${MAX_EMOTE_SLOTS}`} icon={Smile} onBrowse={browse} />
        {ownedEmotes.length === 0 ? (
          <EmptySlot onBrowse={browse} />
        ) : (
          <>
            <p className="mb-2 text-[11px] text-muted">
              Tap to bind in order — the slot number is the key you press in-game.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ownedEmotes.map((c) => (
                <OptionTile key={c.id} c={c} characterClass={characterClass} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

const TABS: { id: CustomizeTab; label: string; icon: typeof User }[] = [
  { id: 'customize', label: 'Customize', icon: Sparkles },
  { id: 'store', label: 'Store', icon: ShoppingBag },
];

/**
 * The player's customization & store hub: a large modal opened from the town
 * player card. A persistent left showcase (your live avatar + identity) sits
 * beside the active tab — Customize (equip what you own) or Store (browse &
 * unlock). Cosmetics are owned and equipped **per class**, so everything here is
 * scoped to the character you're currently playing. Equipping is immediate: it
 * broadcasts live to the town and persists to the account.
 */
export function CustomizePanel() {
  const open = useCustomizeStore((s) => s.open);
  const setOpen = useCustomizeStore((s) => s.setOpen);
  const tab = useCustomizeStore((s) => s.tab);
  const setTab = useCustomizeStore((s) => s.setTab);
  const sessionId = useGameStore((s) => s.sessionId);
  const selectedClass = useCharacterStore((s) => s.selectedClass);
  const byClass = useCosmeticsStore((s) => s.byClass);
  const progress = useAuthStore((s) => s.progress);
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  const characterClass = me?.characterClass ?? selectedClass;
  // Items this class can claim now but hasn't — badged on the Store tab.
  const level =
    (me?.characterClass === characterClass ? me.level : undefined) ??
    progress.find((p) => p.characterClass === characterClass)?.level ??
    1;
  const claimable = claimableCount(
    classCosmeticsOf(byClass, characterClass).owned,
    characterClass,
    level,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="flex h-[88vh] max-h-[760px] max-w-5xl flex-col p-0 sm:max-w-5xl"
        aria-describedby={undefined}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold tracking-wide text-gold">
            <Sparkles size={18} aria-hidden /> Champion
          </DialogTitle>
          <div className="ml-2 flex gap-1 rounded-xl bg-black/30 p-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                    active ? 'bg-gold/15 font-semibold text-gold' : 'text-muted hover:text-text'
                  }`}
                >
                  <Icon size={14} aria-hidden /> {t.label}
                  {t.id === 'store' && claimable > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-black">
                      {claimable}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <DialogClose asChild>
            <IconButton icon={X} aria-label="Close" className="ml-auto" />
          </DialogClose>
        </div>

        {/* One shared, hidden WebGL context renders every emote thumbnail (blit
            into per-card 2D canvases), so the catalog scales without burning a
            context per card. */}
        <EmoteThumbStage characterClass={characterClass} />

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.18fr)]">
          <Showcase characterClass={characterClass} />
          <div className="flex min-h-0 flex-col">
            {tab === 'store' ? (
              <StoreContent characterClass={characterClass} />
            ) : (
              <CustomizeContent characterClass={characterClass} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
