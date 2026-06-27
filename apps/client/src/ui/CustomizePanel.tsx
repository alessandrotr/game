import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronRight,
  Footprints,
  Frame,
  ListFilter,
  Lock,
  Smile,
  Sparkles,
  Sword,
  Tag,
  User,
  Wand2,
  X,
} from 'lucide-react';
import {
  MAX_EMOTE_SLOTS,
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
  type CosmeticType,
  type Loadout,
  type PedestalEffect,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useCosmeticsStore, equipSkin } from '../store/useCosmeticsStore';
import { useCustomizeStore } from '../store/useCustomizeStore';
import { ClassPreview } from './ClassPreview';
import { AvatarFrame } from './AvatarFrame';
import { rimColorOf } from './rim';
import {
  registerPedestalThumb,
  setPedestalThumbHover,
  type PedestalThumbHandle,
} from '../render/pedestalThumbnails';
import {
  registerWeaponThumb,
  setWeaponThumbHover,
  type WeaponThumbHandle,
} from '../render/weaponThumbnails';
import { resolveCharacter } from '../assets/CharacterFactory';
import {
  EmoteThumbStage,
  registerEmoteThumb,
  setEmoteThumbHover,
  type EmoteThumbHandle,
} from '../render/emoteThumbnails';
import { Button, LevelBadge, Meter } from './primitives';
import { STAT_COLORS } from './theme';
import { cn } from '@/lib/utils';
import { PANEL_SURFACE } from './hud/sidebar/panelChrome';

/** Icon per cosmetic type (used on swatches + category headers). */
const TYPE_ICON: Record<CosmeticType, typeof Tag> = {
  skin: User,
  dye: Sparkles,
  pedestal: Footprints,
  emote: Smile,
  title: Tag,
  rim: Frame,
  weapon: Sword,
  enchant: Wand2,
};

/** Cosmetic types that are owned/equipped per class (only this class's show). */
const CLASS_BOUND: ReadonlySet<CosmeticType> = new Set(['skin', 'weapon', 'enchant']);

/** The catalog of a type, narrowed to a class for class-bound types. */
function itemsFor(type: CosmeticType, characterClass: CharacterClass): Cosmetic[] {
  const all = cosmeticsOfType(type);
  if (!CLASS_BOUND.has(type)) return all;
  return all.filter((c) => (c as { characterClass?: string }).characterClass === characterClass);
}

/** The display color a cosmetic "is" (its own color, or its rarity accent). */
function colorOf(c: Cosmetic): string {
  // Only items that *are* a color carry one (pedestals/dyes/rims/enchants). The
  // rest stay neutral so the grid doesn't turn into a rainbow — their rarity
  // reads from the small dot/label instead.
  if (c.type === 'dye' || c.type === 'pedestal' || c.type === 'rim' || c.type === 'enchant')
    return c.color;
  return '#9aa3b8';
}

/** Category display metadata, in store order. */
const CATEGORIES: { type: CosmeticType; label: string; icon: typeof Tag }[] = [
  { type: 'weapon', label: 'Weapons', icon: Sword },
  { type: 'enchant', label: 'Enchants', icon: Wand2 },
  { type: 'rim', label: 'Rings', icon: Frame },
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
    case 'rim':
      return loadout.rimId === c.id;
    case 'emote':
      return loadout.emotes.includes(c.id);
    case 'weapon':
      // The base weapon reads as equipped when no weapon override is set ('').
      return loadout.weaponId === c.id || (loadout.weaponId === '' && !!c.default);
    case 'enchant':
      return loadout.enchantId === c.id;
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
    case 'rim':
      // Toggling a rim off reverts to the standard frame (sanitize defaults '').
      store.equip(characterClass, { rimId: on ? '' : c.id });
      break;
    case 'weapon':
      // Selecting a weapon equips it; re-selecting the active one falls back to
      // the class's base ('' = base weapon).
      store.equip(characterClass, { weaponId: on ? '' : c.id });
      break;
    case 'enchant':
      store.equip(characterClass, { enchantId: on ? '' : c.id });
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
  if (c.type === 'rim') {
    // The actual rim chrome as its own swatch (framing a small dark portrait stand-in).
    return (
      <AvatarFrame rimId={c.id} size="sm" style={{ width: size, height: size }}>
        <div className="grid h-full w-full place-items-center bg-[#0c0e16]">
          <User size={size * 0.34} className="text-white/30" aria-hidden />
        </div>
      </AvatarFrame>
    );
  }
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
  return (
    <PedestalCanvas
      effect={c.effect ?? 'ring'}
      color={c.color}
      color2={c.color2}
      hovered={hovered}
    />
  );
}

/** A `<canvas>` DOM child driven by the shared offscreen weapon renderer — shows a
 *  live 3D weapon (optionally enchanted), the same way pedestals do. */
function WeaponCanvas({
  weaponId,
  enchant,
  hovered = false,
}: {
  weaponId: string;
  enchant?: WeaponThumbHandle['enchant'];
  hovered?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const handle = useRef<WeaponThumbHandle | null>(null);
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
    const h: WeaponThumbHandle = { canvas, weaponId, enchant };
    handle.current = h;
    const stop = registerWeaponThumb(h);
    return () => {
      ro.disconnect();
      stop();
      handle.current = null;
    };
  }, [weaponId, enchant?.effect, enchant?.color, enchant?.color2]);
  useEffect(() => {
    if (handle.current) setWeaponThumbHover(handle.current, hovered);
  }, [hovered]);
  return <canvas ref={ref} className="block h-full w-full" />;
}

/** Real 3D weapon thumbnail (the default white/gray weapon). */
function WeaponThumb({ c, hovered }: { c: Cosmetic & { type: 'weapon' }; hovered?: boolean }) {
  return <WeaponCanvas weaponId={c.weaponId} hovered={hovered} />;
}

/** Real 3D enchant thumbnail — the class's weapon wearing the enchant. */
function EnchantThumb({
  c,
  characterClass,
  hovered,
}: {
  c: Cosmetic & { type: 'enchant' };
  characterClass: CharacterClass;
  hovered?: boolean;
}) {
  const weaponId = resolveCharacter(characterClass).weaponId;
  if (!weaponId) return <Swatch c={c} size={52} />;
  return (
    <WeaponCanvas
      weaponId={weaponId}
      enchant={{ effect: c.effect, color: c.color, color2: c.color2 }}
      hovered={hovered}
    />
  );
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * A store item tile — thumbnail + name only. Hovering previews the item on the
 * avatar and frames the tile teal; clicking equips it (gold frame + check, or the
 * key number for a bound emote). Locked (level-gated) items dim out with a level
 * badge and aren't selectable until unlocked.
 */
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
  const [hovered, setHovered] = useState(false);
  const emoteSlot = c.type === 'emote' && equipped ? loadout.emotes.indexOf(c.id) + 1 : 0;

  // Click equips (auto-unlocking a level-eligible item first). Hover previews on
  // the avatar without committing the loadout.
  const select = () => {
    if (locked) return;
    if (!owned) useCosmeticsStore.getState().unlock(characterClass, c.id);
    equipCosmetic(characterClass, c);
  };

  const accent = equipped ? 'gold' : !locked && (hovered || previewing) ? 'teal' : 'none';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={select}
      onPointerEnter={() => {
        setHovered(true);
        if (!locked) useCustomizeStore.getState().setPreview(c.id);
      }}
      onPointerLeave={() => {
        setHovered(false);
        if (previewing) useCustomizeStore.getState().setPreview(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      }}
      aria-pressed={equipped}
      title={locked ? `${c.name} · unlocks at level ${requiredLevelFor(c)}` : c.name}
      className={`group relative flex aspect-5/6 cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-black/25 transition ${
        accent === 'gold'
          ? 'border-gold shadow-[0_0_18px_rgba(232,178,74,0.45)]'
          : accent === 'teal'
            ? 'border-[#67d6cf] shadow-[0_0_18px_rgba(103,214,207,0.4)]'
            : 'border-white/10 hover:border-white/25'
      }`}
    >
      <div
        className={`relative grid flex-1 place-items-center ${locked ? 'opacity-40 grayscale' : ''}`}
      >
        {c.type === 'pedestal' ? (
          <PedestalThumb c={c} hovered={hovered && !locked} />
        ) : c.type === 'weapon' ? (
          <WeaponThumb c={c} hovered={hovered && !locked} />
        ) : c.type === 'enchant' ? (
          <EnchantThumb c={c} characterClass={characterClass} hovered={hovered && !locked} />
        ) : c.type === 'title' ? (
          <TitleThumb c={c} />
        ) : c.type === 'emote' ? (
          <EmoteThumb anim={c.anim} hovered={hovered && !locked} />
        ) : (
          <Swatch c={c} size={56} />
        )}
      </div>

      {/* Equipped check (gold) / bound-emote key, top-right. */}
      {equipped && c.type !== 'emote' && (
        <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-gold text-black shadow">
          <Check size={12} />
        </span>
      )}
      {c.type === 'emote' && equipped && (
        <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-md bg-gold text-[11px] font-bold leading-none text-black shadow">
          {emoteSlot}
        </span>
      )}
      {/* Locked → level badge, top-right. */}
      {locked && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/70 backdrop-blur-sm">
          <Lock size={10} /> Lv {requiredLevelFor(c)}
        </span>
      )}

      {/* Name — bottom-left, over a soft scrim. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent px-2.5 pb-2 pt-6">
        <span
          className={`block truncate text-left text-[12px] font-semibold ${equipped ? 'text-gold' : 'text-white'}`}
        >
          {c.name}
        </span>
      </span>
    </div>
  );
}

/** One wardrobe category tab — an icon over a bracketed label, stretched to share
 *  the strip evenly. The active tab lifts into a glowing gold-gradient plate with a
 *  bright underline + chevron; the rest sit quiet until hovered. */
function WardrobeTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Tag;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="group relative flex flex-1 basis-0 flex-col items-center gap-1.5 px-1 pb-3 pt-2.5 outline-none"
    >
      <span
        className={`grid h-12 w-full max-w-[4.75rem] place-items-center rounded-xl border transition-all duration-200 ${
          active
            ? 'scale-105 border-gold/70 bg-linear-to-b from-gold/30 to-gold/5 text-gold shadow-[0_0_22px_rgba(232,178,74,0.45),inset_0_1px_0_rgba(255,255,255,0.18)]'
            : 'border-white/10 bg-white/[0.03] text-white/55 group-hover:-translate-y-0.5 group-hover:border-white/25 group-hover:bg-white/[0.06] group-hover:text-white'
        }`}
      >
        <Icon size={active ? 22 : 19} aria-hidden className="transition-all duration-200" />
      </span>
      <span
        className={`text-[10px] font-bold uppercase tracking-[0.16em] transition-colors duration-200 ${
          active ? 'text-gold [text-shadow:0_0_10px_rgba(232,178,74,0.5)]' : 'text-muted group-hover:text-text'
        }`}
      >
        [{label}]
      </span>
      {active && (
        <>
          <span
            aria-hidden
            className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-linear-to-r from-transparent via-gold to-transparent"
          />
          <span
            aria-hidden
            className="absolute -bottom-[5px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-gold"
          />
        </>
      )}
    </button>
  );
}

/** The bottom-bar "Owned" filter — a small switch that narrows the grid to items
 *  you already own (off = browse the full catalog, locked items included). */
function OwnedToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 text-xs font-semibold transition"
    >
      <span className={on ? 'text-gold' : 'text-muted'}>Owned</span>
      <span
        className={`relative h-4 w-7 rounded-full transition-colors ${on ? 'bg-gold/80' : 'bg-white/15'}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? 'left-3.5' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

/**
 * The unified wardrobe: one tab per cosmetic category over a single item grid.
 * Every item shows with its state badged — owned, equipped (gold check), or locked
 * (`Lv N`) — and clicking previews it on the avatar; its button unlocks/equips/binds.
 * The bottom "Owned" switch narrows the grid to what you already own. Replaces the
 * old Customize / Store split with one surface.
 */
function WardrobeContent({
  characterClass,
  onClose,
}: {
  characterClass: CharacterClass;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<CosmeticType>('weapon');
  const [ownedOnly, setOwnedOnly] = useState(false);

  // This class's level gates what can be unlocked (live value if playing it, else
  // the persisted per-class level).
  const progress = useAuthStore((s) => s.progress);
  const sessionId = useGameStore((s) => s.sessionId);
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  const level =
    (me?.characterClass === characterClass ? me.level : undefined) ??
    progress.find((p) => p.characterClass === characterClass)?.level ??
    1;

  const owned = useCosmeticsStore((s) => classCosmeticsOf(s.byClass, characterClass).owned);
  const loadout = useCosmeticsStore((s) => classCosmeticsOf(s.byClass, characterClass).loadout);
  const clearSlot = (patch: Partial<Loadout>) =>
    useCosmeticsStore.getState().equip(characterClass, patch);

  const all = itemsFor(tab, characterClass);
  const items = ownedOnly ? all.filter((c) => owned.includes(c.id)) : all;
  // Pedestal / enchant lead with a "Default" tile (clears the slot back to base).
  const showDefaultPedestal = tab === 'pedestal';
  const showDefaultEnchant = tab === 'enchant';
  // Pad the grid out with empty cells so it reads as a full case (rounding up to a
  // multiple of the column count, a couple of rows minimum).
  const filled = (showDefaultPedestal ? 1 : 0) + (showDefaultEnchant ? 1 : 0) + items.length;
  const emptyCount = Math.max(8, Math.ceil(filled / 4) * 4) - filled;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Category tabs + close — the tabs are the panel's header, stretched to
          fill the full width of the case. */}
      <div className="relative flex items-stretch border-b border-white/10 px-2 pt-1">
        <div className="flex min-w-0 flex-1">
          {CATEGORIES.map((cat) => (
            <WardrobeTab
              key={cat.type}
              icon={cat.icon}
              label={cat.label}
              active={tab === cat.type}
              onClick={() => setTab(cat.type)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 shrink-0 rounded-lg p-1 text-muted transition hover:bg-white/10 hover:text-text"
        >
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {showDefaultPedestal && (
            <DefaultPedestalTile
              active={!loadout.pedestalId}
              onSelect={() => clearSlot({ pedestalId: '' })}
            />
          )}
          {showDefaultEnchant && (
            <DefaultEnchantTile
              active={!loadout.enchantId}
              onSelect={() => clearSlot({ enchantId: '' })}
              characterClass={characterClass}
            />
          )}
          {items.map((c) => (
            <StoreCard key={c.id} c={c} characterClass={characterClass} level={level} />
          ))}
          {Array.from({ length: emptyCount }, (_, i) => (
            <div
              key={`empty-${i}`}
              aria-hidden
              className="aspect-5/6 rounded-2xl border-2 border-white/5 bg-black/15"
            />
          ))}
        </div>
      </div>

      {/* Bottom bar — Store pill (browse all) + the Owned filter switch. */}
      <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
        <button
          type="button"
          onClick={() => setOwnedOnly(false)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
            ownedOnly
              ? 'border-white/10 bg-black/30 text-muted hover:text-text'
              : 'border-gold/40 bg-gold/10 text-gold'
          }`}
        >
          <ListFilter size={14} aria-hidden /> Store <ChevronRight size={14} aria-hidden />
        </button>
        <OwnedToggle on={ownedOnly} onChange={setOwnedOnly} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default ("un-equipped") tiles — the base look for slots that can be cleared.
// ---------------------------------------------------------------------------

/** A storefront-shaped card for a slot's "default" (un-equipped) state — the same
 *  frame as {@link StoreCard} so it sits flush in the wardrobe grid. */
function DefaultCard({
  active,
  onSelect,
  label,
  renderThumb,
}: {
  active: boolean;
  onSelect: () => void;
  label: string;
  renderThumb: (hovered: boolean) => ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={active}
      title={label}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-panel/40 text-left transition hover:-translate-y-0.5 ${
        active ? 'border-white/40' : 'border-white/10 hover:border-white/20'
      }`}
    >
      <div className="relative grid h-24 place-items-center bg-black/20">
        {renderThumb(hovered)}
        {active && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
            <Check size={10} /> Equipped
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <span className="truncate text-sm font-semibold text-text">{label}</span>
        <p className="mb-1 line-clamp-2 min-h-8 text-[11px] leading-snug text-muted">
          The default look — no extra flourish.
        </p>
        <Button
          variant={active ? 'goldOutline' : 'panel'}
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          disabled={active}
          className="mt-auto w-full gap-1.5"
        >
          {active ? (
            <>
              <Check size={13} /> Equipped
            </>
          ) : (
            'Equip'
          )}
        </Button>
      </div>
    </div>
  );
}

/** The default (un-equipped) pedestal — the neutral gray ring every character
 *  starts with. Selecting it clears the equipped pedestal back to default. */
function DefaultPedestalTile({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  return (
    <DefaultCard
      active={active}
      onSelect={onSelect}
      label="Default"
      renderThumb={(hovered) => (
        <PedestalCanvas effect="ring" color={DEFAULT_PEDESTAL_COLOR} hovered={hovered} />
      )}
    />
  );
}

/** The default (no-enchant) tile for the enchant slot — shows the class's plain
 *  weapon in a live canvas. Selecting it clears the equipped enchant. */
function DefaultEnchantTile({
  active,
  onSelect,
  characterClass,
}: {
  active: boolean;
  onSelect: () => void;
  characterClass: CharacterClass;
}) {
  const weaponId = resolveCharacter(characterClass).weaponId;
  return (
    <DefaultCard
      active={active}
      onSelect={onSelect}
      label="No Enchant"
      renderThumb={(hovered) =>
        weaponId ? <WeaponCanvas weaponId={weaponId} hovered={hovered} /> : <span />
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Left showcase — the free-standing champion (over the world) + identity card.
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
  const rimId = preview?.type === 'rim' ? preview.id : loadout.rimId;
  const weaponId = preview?.type === 'weapon' ? preview.id : loadout.weaponId;
  const enchantId = preview?.type === 'enchant' ? preview.id : loadout.enchantId;
  const title = titleId ? getCosmeticOfType(titleId, 'title') : undefined;
  // Previewing (clicking) an emote makes the showcase character perform it.
  const animation: AnimationName =
    preview?.type === 'emote' ? (preview.anim as AnimationName) : 'idle';

  const sessionId = useGameStore.getState().sessionId;
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  const record = progress.find((p) => p.characterClass === characterClass);
  const level = me?.level ?? record?.level ?? 1;
  const { span, into } = xpProgress(level, me?.xp ?? record?.xp ?? 0);

  return (
    <div className="hidden w-80 shrink-0 flex-col justify-end gap-3 md:flex">
      {/* The champion, free-standing over the town (transparent canvas — no frame). */}
      <div className="relative h-104">
        <ClassPreview
          characterClass={characterClass}
          skinId={skinId}
          dyeId={dyeId}
          pedestalId={pedestalId}
          weaponId={weaponId}
          enchantId={enchantId}
          animation={animation}
          spin={false}
          transparent
        />
        {preview && (
          <div className="pointer-events-none absolute left-1/2 top-3 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/85 backdrop-blur-sm">
            Previewing
          </div>
        )}
      </div>

      {/* Identity card. */}
      <div className="rounded-2xl border border-white/10 bg-panel/55 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <LevelBadge level={level} size="lg" color={rimColorOf(rimId)} className="shrink-0" />
          <div className="min-w-0">
            {title && (
              <div
                className="truncate text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: title.color, textShadow: `0 0 8px ${title.color}66` }}
              >
                {title.text}
              </div>
            )}
            <div className="truncate text-2xl font-bold tracking-wide text-white">
              {username ?? me?.name ?? 'Adventurer'}
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
// Champion hub content (the unified wardrobe)
// ---------------------------------------------------------------------------

/**
 * The wardrobe hub body. The free-standing champion + identity card sit to the
 * left (over the world); the tabbed item case is its own floating panel on the
 * right. Cosmetics are owned and equipped **per class**, so everything is scoped
 * to the character you're currently playing. Equipping is immediate: it broadcasts
 * live to the town and persists to the account.
 */
export function ChampionContent({ onClose }: { onClose: () => void }) {
  const sessionId = useGameStore((s) => s.sessionId);
  const selectedClass = useCharacterStore((s) => s.selectedClass);
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  const characterClass = me?.characterClass ?? selectedClass;

  return (
    <>
      {/* One shared, hidden WebGL context renders every emote thumbnail (blit into
          per-card 2D canvases), so the catalog scales without burning a context
          per card. Mounted with the hub so it isn't torn down on collapse. */}
      <EmoteThumbStage characterClass={characterClass} />

      <Showcase characterClass={characterClass} />
      <div
        className={cn(
          PANEL_SURFACE,
          'flex h-[80vh] w-[min(46rem,calc(100vw-26rem))] min-w-0 flex-col',
        )}
      >
        <WardrobeContent characterClass={characterClass} onClose={onClose} />
      </div>
    </>
  );
}
