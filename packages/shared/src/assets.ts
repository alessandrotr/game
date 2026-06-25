/**
 * Asset contract shared by client and server.
 *
 * Game and network code reference **asset IDs** (e.g. `char.warrior`,
 * `vfx.fireball`) — never file paths. The client's AssetRegistry resolves those
 * IDs to descriptors, which today describe primitive placeholder meshes and
 * tomorrow can point at GLTF files with zero changes to gameplay code.
 */

/** A 3-tuple in world/local space: [x, y, z]. */
export type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// Asset IDs — namespaced by category. The namespace is enforced by the type.
// ---------------------------------------------------------------------------

export type CharacterAssetId = `char.${string}`;
export type WeaponAssetId = `weapon.${string}`;
export type VfxAssetId = `vfx.${string}`;
export type MapAssetId = `map.${string}`;
export type PropAssetId = `prop.${string}`;
export type AnimationAssetId = `anim.${string}`;

export type AssetId =
  | CharacterAssetId
  | WeaponAssetId
  | VfxAssetId
  | MapAssetId
  | PropAssetId
  | AnimationAssetId;

/** Top-level asset category, derivable from an id's prefix. */
export type AssetCategory = 'char' | 'weapon' | 'vfx' | 'map' | 'prop' | 'anim';

/** Extract the category from any asset id. */
export function assetCategory(id: AssetId): AssetCategory {
  return id.slice(0, id.indexOf('.')) as AssetCategory;
}

// ---------------------------------------------------------------------------
// Playable classes
// ---------------------------------------------------------------------------

export const CHARACTER_CLASSES = ['warrior', 'mage', 'archer', 'priest', 'ninja'] as const;
export type CharacterClass = (typeof CHARACTER_CLASSES)[number];

export function isCharacterClass(value: unknown): value is CharacterClass {
  return typeof value === 'string' && (CHARACTER_CLASSES as readonly string[]).includes(value);
}

/** Default character asset for each playable class. */
export const CLASS_TO_ASSET = {
  warrior: 'char.warrior',
  mage: 'char.mage',
  archer: 'char.archer',
  priest: 'char.priest',
  ninja: 'char.ninja',
} as const satisfies Record<CharacterClass, CharacterAssetId>;

// ---------------------------------------------------------------------------
// Animation logical names
// ---------------------------------------------------------------------------

export const ANIMATION_NAMES = [
  'idle',
  'walk',
  'run',
  'attack',
  'cast',
  'hit',
  'die',
  // Emotes — player-triggered loops (number keys), replicated like other states.
  'dance1',
  'dance2',
] as const;
export type AnimationName = (typeof ANIMATION_NAMES)[number];

/** Emote animation names, in number-key order (1, 2, …). */
export const EMOTES = ['dance1', 'dance2'] as const;
export type EmoteName = (typeof EMOTES)[number];

export function isEmote(name: string): name is EmoteName {
  return (EMOTES as readonly string[]).includes(name);
}

// ---------------------------------------------------------------------------
// Render sources — the replaceability seam.
// ---------------------------------------------------------------------------

export type PrimitiveShape = 'box' | 'sphere' | 'capsule' | 'cone' | 'cylinder' | 'torus';

/** One primitive mesh in a placeholder model. */
export interface PlaceholderPart {
  /** Optional logical name (debugging, skin recolors, future bone mapping). */
  name?: string;
  shape: PrimitiveShape;
  /** Geometry constructor args, forwarded to the R3F geometry element. */
  args: number[];
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3 | number;
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  /** When set, the part renders transparent at this opacity. */
  opacity?: number;
  /** Selects a special material treatment instead of the plain standard one.
   *  `'glass'` uses the cheap fresnel window glass (no transmission); `'brick'`
   *  and `'tile'` overlay a procedural masonry / roof-tile pattern on the
   *  standard lit material. */
  material?: 'glass' | 'brick' | 'tile' | 'fire';
  /** Marks this part as the weapon's "showpiece" (blade / orb / mace-head). When
   *  the holder has an enchant equipped, this part renders with the animated
   *  enchant material instead of its plain look. Ignored otherwise. */
  enchantable?: boolean;
  /** Shadow participation (default true). Disable on small/flat decor to keep
   *  the shadow pass cheap when a scene has many props. */
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** A model built from primitives — the default while there is no art. */
export interface PlaceholderModel {
  kind: 'placeholder';
  parts: PlaceholderPart[];
  /** Uniform scale applied to the whole figure (mirrors `GltfModel.scale`).
   *  Defaults to 1; used e.g. to render the zombie mini-boss oversized without
   *  re-authoring every part. */
  scale?: number;
}

/** A model backed by a GLTF/GLB file — the future drop-in replacement. */
export interface GltfModel {
  kind: 'gltf';
  /** Resolved at load time by the registry; gameplay never sees this. */
  url: string;
  scale?: number;
  /** Local position offset (e.g. to lift a center-origin model so its feet rest
   *  on the ground). Applied after `scale`. */
  offset?: Vec3;
  /** Yaw (Y-rotation, radians) to correct a model that doesn't face +Z. */
  yaw?: number;
  /** Maps logical animation names to clip names inside the GLTF. When the model
   *  has no clips, a procedural fallback animates it instead. */
  clips?: Partial<Record<AnimationName, string>>;
}

export type RenderSource = PlaceholderModel | GltfModel;

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

export interface CharacterDescriptor {
  id: CharacterAssetId;
  displayName: string;
  /** Playable class, or omitted for NPCs. */
  class?: CharacterClass;
  render: RenderSource;
  /** Optional cosmetic tint (a dye color), multiplied into the body materials. */
  tint?: string;
  /** Weapon held in the character's grip, by id. */
  weaponId?: WeaponAssetId;
  /** Logical animation name → animation asset id. */
  animations?: Partial<Record<AnimationName, AnimationAssetId>>;
}

export interface WeaponDescriptor {
  id: WeaponAssetId;
  displayName: string;
  render: RenderSource;
  /** Local transform applied when the weapon is mounted in a character's grip. */
  grip?: { position?: Vec3; rotation?: Vec3; scale?: number };
}

export type VfxBehavior = 'projectile' | 'burst' | 'aura' | 'static';

export interface VfxDescriptor {
  id: VfxAssetId;
  displayName: string;
  render: RenderSource;
  behavior: VfxBehavior;
  /** Lifetime in milliseconds (0/undefined = persistent). */
  durationMs?: number;
  /** World units/second, for `projectile` behavior. */
  speed?: number;
}

export interface PropDescriptor {
  id: PropAssetId;
  displayName: string;
  render: RenderSource;
}

export interface AnimationDescriptor {
  id: AnimationAssetId;
  name: AnimationName;
  loop?: boolean;
  /** Procedural fallback driven on placeholder meshes that have no skeleton. */
  procedural?: 'none' | 'bob' | 'spin' | 'pulse';
  /** Clip name when this animation is bound to a GLTF model. */
  clip?: string;
}

/** A single placed instance inside a map, referenced purely by asset id. */
export interface MapProp {
  assetId: CharacterAssetId | PropAssetId | VfxAssetId;
  position: Vec3;
  rotation?: Vec3;
  scale?: number | Vec3;
}

/** Semantic regions a map builder lays out (spawn/NPC/shop/portal). Drives
 *  zone markers and gives later systems (matchmaking, shops) named anchors. */
export type MapZoneKind = 'spawn' | 'npc' | 'shop' | 'portal';

export interface MapZone {
  kind: MapZoneKind;
  /** Ground-plane center of the zone. */
  center: Vec3;
  /** Radius of the (circular) zone footprint, in world units. */
  radius: number;
  /** Optional on-ground label. */
  label?: string;
  /** A `portal` zone's destination. Omitted = the opposite world (town↔arena);
   *  `'zombie'` = the zombie-survival arena; `'gunzombie'` = Gun Mode Zombie
   *  (zombie survival fought with guns). Each is a distinct room handler. */
  mode?: 'zombie' | 'gunzombie';
}

export interface MapDescriptor {
  id: MapAssetId;
  displayName: string;
  /** Ground half-extent in world units. */
  halfSize: number;
  groundColor: string;
  /** Static instances placed in the world, by id. */
  props: MapProp[];
  /** Semantic regions laid out by the map builder (spawn/NPC/shop/portal). */
  zones?: MapZone[];
  ambient?: { color: string; intensity: number };
}

/** Discriminated union of every descriptor kind, keyed by category. */
export type AnyDescriptor =
  | CharacterDescriptor
  | WeaponDescriptor
  | VfxDescriptor
  | PropDescriptor
  | MapDescriptor
  | AnimationDescriptor;
