import type { PlaceholderPart, PropDescriptor, Vec3 } from '@arena/shared';

/**
 * Static world props for a stylized low-poly town. Built entirely from
 * primitives (no texture/GLB downloads) so the look is "intentional low-poly"
 * and stays cheap: small flat decor opts out of shadow casting via `castShadow`.
 * Origin is at each prop's base (y = 0 on the ground).
 */

// --- Palette ---------------------------------------------------------------
const PLASTER = '#e6d8b6';
const PLASTER_WARM = '#d9c196';
const TIMBER = '#5a3f28';
const WOOD = '#6e4b2a';
const WOOD_DARK = '#43301d';
const ROOF_RED = '#9c4636';
const ROOF_BROWN = '#714a2b';
const ROOF_SLATE = '#566079';
const STONE = '#8e887b';
const STONE_DARK = '#6c675b';
const STONE_LIGHT = '#a89f8b';
const FOLIAGE = '#3f8a4a';
const FOLIAGE_DARK = '#2f6d3c';
const PINE = '#2e6b40';
const METAL = '#5f656e';
const WATER = '#3f7fb0';
const WINDOW = '#ffe1a0';
const LANTERN = '#ffd27a';
const CLOTH = '#a23b3b';

// --- Part builders (concise primitive helpers) -----------------------------
type P = Partial<PlaceholderPart>;
const box = (args: Vec3, position: Vec3, color: string, extra: P = {}): PlaceholderPart => ({
  shape: 'box',
  args,
  position,
  color,
  roughness: 0.9,
  ...extra,
});
const cyl = (
  rt: number,
  rb: number,
  h: number,
  seg: number,
  position: Vec3,
  color: string,
  extra: P = {},
): PlaceholderPart => ({
  shape: 'cylinder',
  args: [rt, rb, h, seg],
  position,
  color,
  roughness: 0.9,
  ...extra,
});
const cone = (
  r: number,
  h: number,
  seg: number,
  position: Vec3,
  color: string,
  extra: P = {},
): PlaceholderPart => ({ shape: 'cone', args: [r, h, seg], position, color, roughness: 0.9, ...extra });
const sph = (r: number, position: Vec3, color: string, extra: P = {}): PlaceholderPart => ({
  shape: 'sphere',
  args: [r, 8, 7],
  position,
  color,
  roughness: 1,
  ...extra,
});

const glow = (intensity = 1.4): P => ({
  emissive: WINDOW,
  emissiveIntensity: intensity,
  castShadow: false,
});
const pyramid = (r: number, h: number, y: number, color: string): PlaceholderPart =>
  cone(r, h, 4, [0, y, 0], color, { rotation: [0, Math.PI / 4, 0] });

const prop = (id: string, displayName: string, parts: PlaceholderPart[]): PropDescriptor => ({
  id: `prop.${id}`,
  displayName,
  render: { kind: 'placeholder', parts },
});

// --- Buildings -------------------------------------------------------------

/** A cozy cottage: stone footing, plaster walls, peaked roof, glowing windows. */
const house = prop('building.house', 'Cottage', [
  box([3.2, 0.4, 3.2], [0, 0.2, 0], STONE),
  box([2.9, 2, 2.9], [0, 1.4, 0], PLASTER),
  // Corner posts sit PROUD of the wall (outer face ~1.6 vs the wall's 1.45) so
  // their faces aren't coplanar with the plaster — coplanar faces z-fight and
  // shimmer as the camera moves. Proud beams also read as Tudor framing.
  box([0.24, 2, 0.24], [1.5, 1.4, 1.5], TIMBER, { castShadow: false }),
  box([0.24, 2, 0.24], [-1.5, 1.4, 1.5], TIMBER, { castShadow: false }),
  box([0.24, 2, 0.24], [1.5, 1.4, -1.5], TIMBER, { castShadow: false }),
  box([0.24, 2, 0.24], [-1.5, 1.4, -1.5], TIMBER, { castShadow: false }),
  pyramid(2.55, 1.6, 3.2, ROOF_RED),
  box([0.75, 1.2, 0.08], [0, 0.8, 1.46], WOOD_DARK),
  box([0.55, 0.55, 0.06], [-0.85, 1.6, 1.46], WINDOW, glow()),
  box([0.55, 0.55, 0.06], [0.85, 1.6, 1.46], WINDOW, glow()),
  box([0.45, 1, 0.45], [0.95, 3.1, -0.7], STONE_DARK),
]);

/** A second cottage variant (slate roof, warmer walls) for visual variety. */
const cottage = prop('building.cottage', 'Cottage', [
  box([3, 0.4, 2.8], [0, 0.2, 0], STONE),
  box([2.7, 1.9, 2.5], [0, 1.35, 0], PLASTER_WARM),
  pyramid(2.35, 1.5, 3.05, ROOF_BROWN),
  box([0.7, 1.15, 0.08], [0, 0.78, 1.31], WOOD_DARK),
  box([0.5, 0.5, 0.06], [0.8, 1.55, 1.31], WINDOW, glow()),
  box([0.4, 0.95, 0.4], [-0.9, 3, -0.6], STONE_DARK),
]);

/** The tavern: two storeys with a jettied upper floor and a hanging sign. */
const inn = prop('building.inn', 'The Wandering Inn', [
  box([5.2, 0.4, 4.2], [0, 0.2, 0], STONE),
  box([4.8, 2, 3.8], [0, 1.4, 0], PLASTER),
  box([5.2, 1.7, 4.2], [0, 3.25, 0], TIMBER),
  cone(3.7, 1.9, 4, [0, 5, 0], ROOF_BROWN, { rotation: [0, Math.PI / 4, 0] }),
  box([1, 1.5, 0.1], [0, 0.95, 1.95], WOOD_DARK),
  box([0.7, 0.7, 0.06], [-1.6, 1.5, 1.92], WINDOW, glow()),
  box([0.7, 0.7, 0.06], [1.6, 1.5, 1.92], WINDOW, glow()),
  box([0.6, 0.6, 0.06], [-1.4, 3.3, 2.12], WINDOW, glow(1.1)),
  box([0.6, 0.6, 0.06], [1.4, 3.3, 2.12], WINDOW, glow(1.1)),
  box([0.55, 1.1, 0.55], [2, 5, -1.2], STONE_DARK),
  box([0.12, 0.12, 0.9], [2.6, 2.5, 1.6], WOOD, { castShadow: false }),
  box([0.9, 0.6, 0.08], [2.6, 2.05, 2.05], WOOD, { emissive: LANTERN, emissiveIntensity: 0.3 }),
]);

/** Blacksmith: heavy stone shop with a big smoking chimney + ember glow. */
const smithy = prop('building.smithy', 'Blacksmith', [
  box([3.6, 0.4, 3], [0, 0.2, 0], STONE),
  box([3.3, 1.8, 2.7], [0, 1.3, 0], STONE_DARK),
  pyramid(2.6, 1.2, 2.85, ROOF_SLATE),
  box([1.1, 1.4, 0.1], [0, 0.9, 1.36], '#241b12'),
  box([0.75, 2.4, 0.75], [1.25, 2.6, -0.7], STONE_DARK),
  box([0.5, 0.3, 0.5], [1.25, 3.95, -0.7], '#ff7a3a', {
    emissive: '#ff7a3a',
    emissiveIntensity: 1.6,
    castShadow: false,
  }),
  box([0.5, 0.3, 0.3], [1.4, 0.55, 1.5], METAL, { metalness: 0.6, roughness: 0.5 }),
  cyl(0.18, 0.22, 0.4, 8, [1.4, 0.2, 1.5], METAL, { metalness: 0.6 }),
]);

/** Watchtower with crenellated top, conical roof, and a banner. */
const tower = prop('building.tower', 'Watchtower', [
  box([3, 0.6, 3], [0, 0.3, 0], STONE),
  cyl(1.3, 1.5, 5, 12, [0, 3, 0], STONE),
  cyl(1.65, 1.65, 0.7, 12, [0, 5.6, 0], STONE_DARK),
  cone(1.75, 2, 12, [0, 6.9, 0], ROOF_SLATE),
  box([0.3, 0.7, 0.06], [0, 3, 1.5], WINDOW, glow(1)),
  cyl(0.05, 0.05, 1.6, 6, [0, 8.7, 0], WOOD, { castShadow: false }),
  box([0.9, 0.5, 0.04], [0.5, 8.7, 0], CLOTH, { castShadow: false }),
]);

// --- Town centre & furniture ----------------------------------------------

/** Stone well with a little roof — a natural town-square centrepiece. */
const well = prop('well', 'Well', [
  cyl(1.1, 1.15, 0.9, 12, [0, 0.45, 0], STONE),
  cyl(0.85, 0.85, 0.8, 12, [0, 0.5, 0], WATER, {
    castShadow: false,
    roughness: 0.3,
    metalness: 0.2,
  }),
  box([0.18, 1.7, 0.18], [0.9, 0.85, 0], WOOD),
  box([0.18, 1.7, 0.18], [-0.9, 0.85, 0], WOOD),
  cyl(0.1, 0.1, 2, 6, [0, 1.7, 0], WOOD, { rotation: [0, 0, Math.PI / 2], castShadow: false }),
  pyramid(1.4, 0.8, 2.3, ROOF_BROWN),
  box([0.4, 0.4, 0.4], [0, 1.2, 0], WOOD_DARK, { castShadow: false }),
]);

/** Lantern post — warm emissive top (no real light, so it's free). */
const lamp = prop('lamp', 'Lamppost', [
  box([0.34, 0.16, 0.34], [0, 0.08, 0], STONE_DARK),
  cyl(0.07, 0.09, 2.4, 8, [0, 1.2, 0], METAL, { metalness: 0.4 }),
  box([0.36, 0.42, 0.36], [0, 2.5, 0], METAL, { metalness: 0.4 }),
  box([0.22, 0.3, 0.22], [0, 2.5, 0], LANTERN, {
    emissive: LANTERN,
    emissiveIntensity: 1.8,
    castShadow: false,
  }),
  pyramid(0.3, 0.25, 2.78, METAL),
]);

/** A ~2u fence segment (tileable along a line). */
const fence = prop('fence', 'Fence', [
  box([0.16, 1, 0.16], [-0.9, 0.5, 0], WOOD),
  box([0.16, 1, 0.16], [0.9, 0.5, 0], WOOD),
  box([2, 0.12, 0.08], [0, 0.75, 0], WOOD, { castShadow: false }),
  box([2, 0.12, 0.08], [0, 0.4, 0], WOOD, { castShadow: false }),
]);

/** Stone gateway arch — frames the arena portal. */
const arch = prop('arch', 'Stone Arch', [
  box([0.7, 3.2, 0.9], [-1.8, 1.6, 0], STONE),
  box([0.7, 3.2, 0.9], [1.8, 1.6, 0], STONE),
  box([4.3, 0.7, 0.95], [0, 3.4, 0], STONE_LIGHT),
  box([0.9, 0.5, 0.5], [0, 3.4, 0], LANTERN, {
    emissive: LANTERN,
    emissiveIntensity: 0.6,
    castShadow: false,
  }),
]);

/** Market stall with a striped awning and a few goods on the counter. */
const stall = prop('market.stall', 'Market Stall', [
  box([0.12, 1.8, 0.12], [-1.1, 0.9, -0.5], WOOD),
  box([0.12, 1.8, 0.12], [1.1, 0.9, -0.5], WOOD),
  box([0.12, 1.2, 0.12], [-1.1, 0.6, 0.5], WOOD),
  box([0.12, 1.2, 0.12], [1.1, 0.6, 0.5], WOOD),
  box([2.4, 0.12, 1.1], [0, 1, 0], WOOD),
  box([2.6, 0.1, 1.4], [0, 1.85, -0.1], CLOTH, { rotation: [-0.25, 0, 0], castShadow: false }),
  box([2.6, 0.1, 0.5], [0, 1.9, -0.7], '#e8d9b0', {
    rotation: [-0.25, 0, 0],
    castShadow: false,
  }),
  box([0.35, 0.35, 0.35], [-0.6, 1.25, 0], ROOF_RED, { castShadow: false }),
  sph(0.18, [0, 1.2, 0.1], '#d8607f', { castShadow: false }),
  sph(0.18, [0.5, 1.2, -0.1], '#e8c34a', { castShadow: false }),
]);

/** Wooden barrel. */
const barrel = prop('barrel', 'Barrel', [
  cyl(0.38, 0.32, 0.9, 10, [0, 0.45, 0], WOOD),
  {
    shape: 'torus',
    args: [0.38, 0.04, 6, 12],
    position: [0, 0.7, 0],
    rotation: [Math.PI / 2, 0, 0],
    color: METAL,
    castShadow: false,
  },
  {
    shape: 'torus',
    args: [0.38, 0.04, 6, 12],
    position: [0, 0.2, 0],
    rotation: [Math.PI / 2, 0, 0],
    color: METAL,
    castShadow: false,
  },
]);

/** Wooden crate. */
const crate = prop('crate', 'Crate', [
  box([0.7, 0.7, 0.7], [0, 0.35, 0], WOOD),
  box([0.74, 0.1, 0.74], [0, 0.66, 0], WOOD_DARK, { castShadow: false }),
]);

/** A small handcart of produce. */
const cart = prop('cart', 'Handcart', [
  box([1.6, 0.5, 0.9], [0, 0.7, 0], WOOD),
  {
    shape: 'torus',
    args: [0.45, 0.1, 6, 12],
    position: [0, 0.45, 0.55],
    color: WOOD_DARK,
  },
  {
    shape: 'torus',
    args: [0.45, 0.1, 6, 12],
    position: [0, 0.45, -0.55],
    color: WOOD_DARK,
  },
  sph(0.22, [-0.3, 1.05, 0], FOLIAGE, { castShadow: false }),
  sph(0.22, [0.3, 1.05, 0], ROOF_RED, { castShadow: false }),
]);

// --- Vegetation & nature ---------------------------------------------------

/** Rounded broadleaf tree (stacked foliage blobs). */
const tree = prop('tree', 'Tree', [
  cyl(0.22, 0.32, 1.7, 6, [0, 0.85, 0], WOOD_DARK),
  sph(1.2, [0, 2.3, 0], FOLIAGE),
  sph(0.95, [0.5, 2.9, 0.2], FOLIAGE_DARK),
  sph(0.85, [-0.45, 2.7, -0.2], FOLIAGE),
]);

/** Conifer (stacked cones). */
const pine = prop('tree.pine', 'Pine', [
  cyl(0.2, 0.28, 1.2, 6, [0, 0.6, 0], WOOD_DARK),
  cone(1.3, 1.6, 8, [0, 1.8, 0], PINE),
  cone(1.05, 1.4, 8, [0, 2.8, 0], PINE),
  cone(0.75, 1.2, 8, [0, 3.7, 0], PINE),
]);

/** Low bush. */
const bush = prop('bush', 'Bush', [
  sph(0.55, [0, 0.45, 0], FOLIAGE_DARK, { castShadow: false }),
  sph(0.45, [0.4, 0.4, 0.1], FOLIAGE, { castShadow: false }),
  sph(0.42, [-0.35, 0.38, -0.1], FOLIAGE_DARK, { castShadow: false }),
]);

/** A weathered boulder (flattened low-poly sphere). */
const rock = prop('rock', 'Rock', [
  sph(0.7, [0, 0.4, 0], STONE, { scale: [1.2, 0.7, 1], roughness: 1 }),
]);

/** A cluster of flowers / a flowerbed accent. */
const flowers = prop('flowers', 'Flowers', [
  sph(0.5, [0, 0.18, 0], FOLIAGE_DARK, { scale: [1.3, 0.5, 1.3], castShadow: false }),
  sph(0.1, [0.2, 0.35, 0.1], '#d8607f', { castShadow: false }),
  sph(0.1, [-0.2, 0.35, -0.1], '#e8c34a', { castShadow: false }),
  sph(0.1, [0.05, 0.35, -0.2], '#7aa0e0', { castShadow: false }),
  sph(0.1, [-0.1, 0.35, 0.2], '#e8c34a', { castShadow: false }),
]);

/** Signpost at a path junction. */
const signpost = prop('signpost', 'Signpost', [
  cyl(0.08, 0.1, 1.8, 6, [0, 0.9, 0], WOOD),
  box([0.9, 0.3, 0.06], [0.35, 1.5, 0], WOOD_DARK, { castShadow: false }),
  box([0.7, 0.28, 0.06], [-0.25, 1.1, 0], WOOD_DARK, { castShadow: false }),
]);

// --- Castle & city walls (Ultima Online / Britain flavour) -----------------

/** A corner tower for the castle: shaft, crenellated cap, conical roof. */
const castleTower = (x: number, z: number): PlaceholderPart[] => [
  cyl(1.1, 1.25, 8, 12, [x, 4, z], STONE),
  cyl(1.4, 1.4, 0.7, 12, [x, 8, z], STONE_DARK),
  cone(1.5, 1.7, 12, [x, 9.2, z], ROOF_SLATE),
];

/** Lord British's keep: a stone castle with four corner towers, a battlemented
 *  keep, a gatehouse, and banners — the town's centrepiece. */
const castle = prop('castle', "Lord British's Castle", [
  box([10, 0.8, 10], [0, 0.4, 0], STONE_DARK), // foundation
  box([6.5, 5.5, 6.5], [0, 3.2, 0], STONE), // keep
  box([7.1, 0.7, 7.1], [0, 6.2, 0], STONE_DARK), // keep battlement
  box([3.2, 0.9, 3.2], [0, 6.9, 0], STONE), // upper turret
  cone(2.6, 2.2, 4, [0, 8.5, 0], ROOF_SLATE, { rotation: [0, Math.PI / 4, 0] }),
  // Gatehouse with a dark portcullis, facing +z.
  box([4.5, 4, 2], [0, 2, 4.5], STONE),
  box([1.8, 2.6, 0.3], [0, 1.5, 5.5], '#1f1812'),
  box([5.1, 0.6, 2.4], [0, 4.2, 4.5], STONE_DARK),
  // Four corner towers.
  ...castleTower(4.5, 4.5),
  ...castleTower(-4.5, 4.5),
  ...castleTower(4.5, -4.5),
  ...castleTower(-4.5, -4.5),
  // Glowing windows on the keep.
  box([0.6, 0.9, 0.06], [-1.6, 3.4, 3.26], WINDOW, glow(1)),
  box([0.6, 0.9, 0.06], [1.6, 3.4, 3.26], WINDOW, glow(1)),
  // Banners on the gatehouse.
  box([0.05, 1.4, 0.5], [-1.4, 3.4, 5.6], CLOTH, { castShadow: false }),
  box([0.05, 1.4, 0.5], [1.4, 3.4, 5.6], CLOTH, { castShadow: false }),
]);

/** A ~5u crenellated stone wall segment (tileable along the city perimeter). */
const wall = prop('wall', 'City Wall', [
  box([5, 2.6, 0.9], [0, 1.3, 0], STONE),
  box([0.7, 0.5, 0.95], [-1.6, 2.85, 0], STONE_DARK, { castShadow: false }),
  box([0.7, 0.5, 0.95], [0, 2.85, 0], STONE_DARK, { castShadow: false }),
  box([0.7, 0.5, 0.95], [1.6, 2.85, 0], STONE_DARK, { castShadow: false }),
]);

export const PROPS: PropDescriptor[] = [
  house,
  cottage,
  inn,
  smithy,
  tower,
  well,
  lamp,
  fence,
  arch,
  stall,
  barrel,
  crate,
  cart,
  tree,
  pine,
  bush,
  rock,
  flowers,
  signpost,
  castle,
  wall,
];
