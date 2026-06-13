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
// Team accents for the left (blue) / right (red) sides of town.
const TEAM_BLUE = '#3f72c4';
const TEAM_RED = '#c43f3f';

// --- Trailer-park / arena junk palette (gritty, weathered, post-apocalyptic) -
const RUST = '#7c4a2f';
const RUST_DARK = '#522f1d';
const SCRAP = '#6f675b';
const SCRAP_DARK = '#474037';
const SIDING = '#c2b9a6'; // weathered cream trailer siding
const SIDING_TEAL = '#7e9091'; // faded teal trailer
const SIDING_OLIVE = '#7c8163'; // faded olive trailer
const TIN = '#857c6f'; // dull metal roof
const CHAR = '#221f1c'; // charred black (burned vehicles)
const CHAR_RUST = '#46342a'; // charred + rust
const GLASS_DK = '#33403c'; // broken / blown-out window glass
const TRASH = '#534b3d'; // refuse mound
const BAG = '#23211d'; // black garbage bags
const TIRE = '#1d1b1a'; // old rubber
const FIRE = '#ff7a3a'; // burn-barrel flame (emissive)

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

/**
 * Team-coloured building variants for the two sides of town: clone a building's
 * parts and swap its `swap` colours (a roof, or the tower's banner) for the side
 * accent — blue on the left, red on the right. Everything else is unchanged, so
 * the homes/towers read as belonging to a team without re-modelling them.
 */
function teamVariant(base: PropDescriptor, side: 'blue' | 'red', swap: string[]): PropDescriptor {
  const accent = side === 'blue' ? TEAM_BLUE : TEAM_RED;
  const parts =
    base.render.kind === 'placeholder'
      ? base.render.parts.map((p) => (swap.includes(p.color) ? { ...p, color: accent } : p))
      : [];
  return {
    id: `${base.id}.${side}`,
    displayName: `${base.displayName} (${side})`,
    render: { kind: 'placeholder', parts },
  };
}

// Tower banner + conical roof take the team colour; every house/building roof does too.
const towerBlue = teamVariant(tower, 'blue', [CLOTH, ROOF_SLATE]);
const towerRed = teamVariant(tower, 'red', [CLOTH, ROOF_SLATE]);
const houseBlue = teamVariant(house, 'blue', [ROOF_RED]);
const houseRed = teamVariant(house, 'red', [ROOF_RED]);
const cottageBlue = teamVariant(cottage, 'blue', [ROOF_BROWN]);
const cottageRed = teamVariant(cottage, 'red', [ROOF_BROWN]);
const innBlue = teamVariant(inn, 'blue', [ROOF_BROWN]); // inn sits on the left
const smithyRed = teamVariant(smithy, 'red', [ROOF_SLATE]); // smithy sits on the right

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

// Team-coloured awnings for the market stalls (blue left, red right).
const stallBlue = teamVariant(stall, 'blue', [CLOTH]);
const stallRed = teamVariant(stall, 'red', [CLOTH]);

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

// --- Trailer-park battleground (arena) -------------------------------------
//
// Same primitive-only, flat-shaded approach as the town above, but weathered:
// faded siding, rust streaks, charred metal, scattered junk. Big pieces
// (trailers, burned cars, dumpsters, scrap piles, drum clusters) are COVER and
// MUST have a matching collision circle in `ARENA_LAYOUTS.trailerpark`
// (packages/shared/src/constants.ts) — exactly like the town keeps props in
// sync with TOWN_OBSTACLES. Small flat litter (trash, debris, crates, tyres,
// fences) is decorative-only and opts out of both collision and shadows.

const ns: P = { castShadow: false };

/** A single-wide mobile home up on cinderblocks: faded siding, tin roof, rust
 *  streaks, a busted door, boarded and blown-out windows. ~5u long. */
const trailerParts = (siding: string): PlaceholderPart[] => [
  box([5, 0.5, 2.5], [0, 0.25, 0], SCRAP_DARK), // skirting / underpinning
  box([4.8, 1.9, 2.4], [0, 1.4, 0], siding), // body
  box([4.9, 0.18, 2.46], [0, 0.6, 0], RUST_DARK, ns), // rust water-line
  box([5.1, 0.22, 2.62], [0, 2.45, 0], TIN), // low tin roof (overhang)
  box([1.5, 0.24, 0.9], [-1.1, 2.47, 0.3], RUST, ns), // roof rust patch
  box([0.8, 0.5, 0.8], [1.3, 2.8, -0.3], SCRAP, { metalness: 0.3, castShadow: false }), // rooftop AC unit
  cyl(0.1, 0.1, 0.5, 6, [-1.8, 2.75, 0.5], SCRAP_DARK, ns), // vent pipe
  box([0.85, 1.45, 0.08], [1.25, 1.02, 1.21], RUST_DARK), // door
  box([1, 0.4, 0.6], [1.25, 0.2, 1.5], SCRAP_DARK, ns), // cinderblock step
  box([0.85, 0.75, 0.06], [-1.35, 1.6, 1.21], GLASS_DK), // window (blown out)
  box([0.85, 0.75, 0.06], [-0.1, 1.6, 1.21], GLASS_DK), // window (boarded below)
  box([0.92, 0.13, 0.08], [-0.1, 1.75, 1.24], WOOD, ns), // board
  box([0.92, 0.13, 0.08], [-0.1, 1.45, 1.24], WOOD, ns), // board
  box([0.08, 1.4, 0.5], [2.45, 1.1, 0.2], RUST, ns), // rust streak (end)
  box([0.06, 1.1, 0.4], [-2.43, 1, -0.4], RUST, ns), // rust streak (end)
  cyl(0.34, 0.34, 0.28, 10, [1.6, 0.3, -1.05], CHAR, { rotation: [Math.PI / 2, 0, 0], castShadow: false }), // exposed wheel
];
const trailer = prop('arena.trailer', 'Trailer', trailerParts(SIDING));
const trailerTeal = prop('arena.trailer.teal', 'Trailer', trailerParts(SIDING_TEAL));
const trailerOlive = prop('arena.trailer.olive', 'Trailer', trailerParts(SIDING_OLIVE));

/** A burned-out sedan: charred shell, melted-flat tyres, blown windows, a faint
 *  smoulder still glowing in the engine bay. ~3.4u long. */
const burnedCar = prop('arena.car.burned', 'Burned Car', [
  box([3.4, 0.55, 1.6], [0, 0.5, 0], CHAR), // chassis
  box([3.2, 0.45, 1.5], [0, 0.85, 0], CHAR_RUST), // lower body
  box([1.8, 0.7, 1.45], [-0.15, 1.35, 0], CHAR), // cabin (greenhouse)
  box([1.6, 0.12, 1.35], [-0.15, 1.72, 0], CHAR, ns), // sagging roof remnant
  box([1.1, 0.18, 1.45], [1.35, 1.05, 0], CHAR_RUST, ns), // hood
  box([1, 0.5, 0.06], [0.3, 0.9, 0.78], RUST, ns), // side rust
  box([1, 0.5, 0.06], [0.3, 0.9, -0.78], RUST, ns),
  box([1, 0.9, 0.06], [-0.25, 0.95, 0.78], CHAR_RUST, { rotation: [0, 0.4, 0], castShadow: false }), // door, ajar
  cyl(0.4, 0.4, 0.3, 10, [1.1, 0.3, 0.7], CHAR, { rotation: [Math.PI / 2, 0, 0], castShadow: false }),
  cyl(0.4, 0.4, 0.3, 10, [1.1, 0.3, -0.7], CHAR, { rotation: [Math.PI / 2, 0, 0], castShadow: false }),
  cyl(0.4, 0.4, 0.3, 10, [-1.1, 0.3, 0.7], CHAR, { rotation: [Math.PI / 2, 0, 0], castShadow: false }),
  cyl(0.4, 0.4, 0.3, 10, [-1.1, 0.3, -0.7], CHAR, { rotation: [Math.PI / 2, 0, 0], castShadow: false }),
  box([0.5, 0.1, 0.6], [1.35, 0.95, 0], '#5a2a14', {
    emissive: FIRE,
    emissiveIntensity: 0.5,
    castShadow: false,
  }), // engine-bay smoulder
]);

/** A heap of twisted scrap: corrugated sheets, a bent pipe, a steel offcut. */
const scrapPile = prop('arena.scrap', 'Scrap Pile', [
  box([2, 0.6, 1.6], [0, 0.3, 0], SCRAP_DARK, ns), // base mound
  box([1.8, 1.4, 0.08], [0.2, 0.95, 0.2], SCRAP, { rotation: [0.2, 0.3, 0.15] }), // leaning sheet
  box([1.5, 1.2, 0.08], [-0.3, 0.85, -0.3], RUST, { rotation: [-0.15, -0.4, -0.2] }), // leaning sheet
  box([0.6, 0.6, 0.6], [0.5, 0.45, -0.45], SCRAP, { rotation: [0.2, 0.5, 0.1] }), // steel chunk
  cyl(0.1, 0.1, 1.8, 8, [0.4, 0.55, 0.6], SCRAP, { rotation: [0, 0, 1.3], castShadow: false }), // pipe
  box([0.09, 0.09, 1.4], [-0.4, 0.5, 0.4], RUST_DARK, { rotation: [0.3, 0.6, 0.2], castShadow: false }), // twisted bar
]);

/** A rusted dumpster with one lid flopped open — solid mid-size cover. */
const dumpster = prop('arena.dumpster', 'Dumpster', [
  box([2, 1.1, 1.2], [0, 0.65, 0], SCRAP_DARK), // body
  box([2.12, 0.12, 1.32], [0, 1.22, 0], SCRAP, ns), // top rim
  box([0.95, 0.08, 1.25], [0.5, 1.27, 0], RUST_DARK), // closed lid
  box([1, 0.08, 1.25], [-0.55, 1.45, -0.45], RUST, { rotation: [-0.7, 0, 0] }), // open lid
  box([0.08, 0.9, 1], [1.01, 0.7, 0], RUST, ns), // side rust streak
  box([2.02, 0.5, 0.06], [0, 0.5, 0.61], RUST, ns), // front rust streak
  cyl(0.12, 0.12, 0.2, 8, [0.8, 0.1, 0.5], CHAR, { rotation: [Math.PI / 2, 0, 0], castShadow: false }), // caster
  cyl(0.12, 0.12, 0.2, 8, [-0.8, 0.1, 0.5], CHAR, { rotation: [Math.PI / 2, 0, 0], castShadow: false }),
]);

/** A ~2u rusted corrugated-metal fence segment (tileable; decorative). */
const rustFence = prop('arena.fence.rust', 'Rusted Fence', [
  cyl(0.07, 0.08, 1.8, 6, [-0.95, 0.9, 0], SCRAP_DARK, ns), // post
  cyl(0.07, 0.08, 1.8, 6, [0.95, 0.9, 0], SCRAP_DARK, ns), // post
  box([1.9, 1.3, 0.05], [0, 0.95, 0], RUST, ns), // corrugated panel
  box([0.4, 1.3, 0.06], [0.5, 0.95, 0.01], SCRAP, ns), // lighter panel patch
  box([2, 0.08, 0.08], [0, 1.62, 0], SCRAP_DARK, ns), // top rail
]);

/** A rusted 55-gallon oil drum. */
const oilDrum = prop('arena.drum', 'Oil Drum', [
  cyl(0.4, 0.4, 1, 12, [0, 0.5, 0], RUST),
  cyl(0.42, 0.42, 0.06, 12, [0, 1, 0], RUST_DARK, ns), // lid
  {
    shape: 'torus',
    args: [0.4, 0.04, 6, 12],
    position: [0, 0.35, 0],
    rotation: [Math.PI / 2, 0, 0],
    color: RUST_DARK,
    castShadow: false,
  },
  {
    shape: 'torus',
    args: [0.4, 0.04, 6, 12],
    position: [0, 0.7, 0],
    rotation: [Math.PI / 2, 0, 0],
    color: RUST_DARK,
    castShadow: false,
  },
]);

/** A burning barrel — flames glow (emissive); ArenaLights drops a warm point
 *  light at each one (keep placements in sync with scene/ArenaLights.tsx). */
const fireBarrel = prop('arena.drum.fire', 'Burning Barrel', [
  cyl(0.4, 0.4, 1, 12, [0, 0.5, 0], CHAR),
  {
    shape: 'torus',
    args: [0.4, 0.04, 6, 12],
    position: [0, 0.4, 0],
    rotation: [Math.PI / 2, 0, 0],
    color: RUST,
    castShadow: false,
  },
  cone(0.34, 0.7, 7, [0, 1.3, 0], FIRE, { emissive: FIRE, emissiveIntensity: 2.2, castShadow: false }),
  cone(0.2, 0.5, 7, [0.06, 1.45, -0.04], '#ffd27a', {
    emissive: '#ffd27a',
    emissiveIntensity: 2.6,
    castShadow: false,
  }),
]);

/** A pile of refuse: black bin-bags, a dented can, loose junk. Decorative. */
const trashPile = prop('arena.trash', 'Trash Pile', [
  sph(0.7, [0, 0.3, 0], TRASH, { scale: [1.4, 0.6, 1.2], castShadow: false }),
  sph(0.35, [0.3, 0.3, 0.2], BAG, { roughness: 0.5, castShadow: false }),
  sph(0.3, [-0.25, 0.28, -0.15], BAG, { roughness: 0.5, castShadow: false }),
  sph(0.28, [0.05, 0.32, -0.3], BAG, { roughness: 0.5, castShadow: false }),
  box([0.3, 0.22, 0.4], [0.45, 0.2, -0.35], SCRAP, ns),
  cyl(0.07, 0.07, 0.18, 8, [-0.45, 0.1, 0.35], SCRAP, { rotation: [0.5, 0, 0.3], castShadow: false }), // dented can
]);

/** A smashed wooden crate with a sprung slat and a plank fallen beside it. */
const brokenCrate = prop('arena.crate.broken', 'Broken Crate', [
  box([0.7, 0.7, 0.7], [0, 0.34, 0], WOOD, { rotation: [0, 0.3, 0.08] }),
  box([0.74, 0.1, 0.18], [0, 0.66, 0.2], WOOD_DARK, ns), // sprung top slat
  box([0.9, 0.06, 0.14], [0.6, 0.04, 0.3], WOOD, { rotation: [0, 0.5, 0], castShadow: false }), // fallen plank
  box([0.5, 0.06, 0.12], [-0.4, 0.03, -0.3], WOOD_DARK, { rotation: [0, -0.6, 0], castShadow: false }),
]);

/** Scattered ground debris (planks, sheet metal, rubble) — flat, decorative. */
const debris = prop('arena.debris', 'Debris', [
  box([1.2, 0.05, 0.2], [0, 0.03, 0], WOOD_DARK, { rotation: [0, 0.4, 0], castShadow: false }),
  box([0.9, 0.05, 0.25], [0.4, 0.03, 0.4], SCRAP, { rotation: [0, -0.6, 0], castShadow: false }),
  box([0.6, 0.04, 0.5], [-0.4, 0.02, -0.3], RUST, { rotation: [0, 0.9, 0], castShadow: false }),
  sph(0.18, [-0.5, 0.1, 0.4], STONE_DARK, ns),
  sph(0.13, [0.5, 0.08, -0.5], STONE, ns),
]);

/** A stack of bald old tyres. Decorative. */
const tireStack = prop('arena.tires', 'Tyre Stack', [
  {
    shape: 'torus',
    args: [0.4, 0.18, 8, 12],
    position: [0, 0.18, 0],
    rotation: [Math.PI / 2, 0, 0],
    color: TIRE,
    castShadow: false,
  },
  {
    shape: 'torus',
    args: [0.4, 0.18, 8, 12],
    position: [0.05, 0.5, 0.04],
    rotation: [Math.PI / 2, 0.2, 0],
    color: TIRE,
    castShadow: false,
  },
  {
    shape: 'torus',
    args: [0.4, 0.18, 8, 12],
    position: [-0.03, 0.82, -0.03],
    rotation: [Math.PI / 2, -0.15, 0],
    color: TIRE,
  },
]);

// --- Road signs (arena) ----------------------------------------------------
// Derelict, dead-city road signs that replace the old rusted-fence decor: faded
// sun-bleached paint, rust streaks, grime smears and bullet holes on a corroded
// post. The layout places each at a random yaw and a crooked/toppled lean.
const SIGN_POST = '#534637'; // corroded, dirt-caked post
const SIGN_RED = '#7c3a30'; // oxidized, faded red
const SIGN_WHITE = '#9d988a'; // grimy, sun-bleached off-white
const SIGN_YELLOW = '#9d8638'; // faded mustard
const SIGN_BLUE = '#3b5570'; // dirty faded blue
const SIGN_BLACK = '#1b1a16';
const SIGN_RUST = '#5a3a25'; // rust run-off streak
const SIGN_HOLE = '#131210'; // bullet hole / punched void
const SIGN_GRIME = '#2c281f'; // dark grime smear
/** A corroded, dirt-streaked signpost with a rust collar. */
const signPost = (h = 1.8): PlaceholderPart[] => [
  cyl(0.05, 0.06, h, 6, [0, h / 2, 0], SIGN_POST, ns),
  cyl(0.065, 0.065, 0.12, 6, [0, h * 0.45, 0], SIGN_RUST, ns), // rust collar
];

// --- Weathering decals (drawn on the sign face, z just in front) ---
/** A vertical rust run-off streak. */
const rustStreak = (x: number, y: number, h: number): PlaceholderPart =>
  box([0.05, h, 0.012], [x, y, 0.066], SIGN_RUST, ns);
/** A punched-through bullet hole (dark recessed disc). */
const bulletHole = (x: number, y: number): PlaceholderPart =>
  cyl(0.05, 0.05, 0.06, 7, [x, y, 0.04], SIGN_HOLE, { rotation: [Math.PI / 2, 0, 0], castShadow: false });
/** A dark grime smear patch. */
const grimePatch = (x: number, y: number, w: number, h: number): PlaceholderPart =>
  box([w, h, 0.012], [x, y, 0.064], SIGN_GRIME, ns);

// An octagon (8-seg cylinder) faces forward via PI/2 about X; the SECOND euler
// (local Y, which becomes the facing axis after that turn) rolls it a
// half-segment so a flat edge sits on top — a proper stop-sign octagon, in plane.
const OCTA_FACING: Vec3 = [Math.PI / 2, Math.PI / 8, 0];

/** STOP: faded red octagon, shot up and rust-streaked. */
const signStop = prop('arena.sign.stop', 'Stop Sign', [
  ...signPost(),
  cyl(0.47, 0.47, 0.05, 8, [0, 1.95, -0.01], SIGN_WHITE, { rotation: OCTA_FACING, castShadow: false }),
  cyl(0.42, 0.42, 0.07, 8, [0, 1.95, 0.01], SIGN_RED, { rotation: OCTA_FACING }),
  box([0.46, 0.11, 0.02], [0, 1.95, 0.06], SIGN_WHITE, ns),
  rustStreak(0.18, 1.85, 0.5),
  rustStreak(-0.22, 1.92, 0.32),
  bulletHole(-0.1, 2.04),
  bulletHole(0.15, 1.79),
  grimePatch(0.02, 1.72, 0.32, 0.18),
]);

/** WARNING: faded yellow diamond, grimed and holed. */
const signWarning = prop('arena.sign.warning', 'Warning Sign', [
  ...signPost(),
  box([0.58, 0.58, 0.06], [0, 1.95, 0], SIGN_YELLOW, { rotation: [0, 0, Math.PI / 4] }),
  box([0.07, 0.26, 0.02], [0, 2.0, 0.05], SIGN_BLACK, ns),
  box([0.07, 0.07, 0.02], [0, 1.8, 0.05], SIGN_BLACK, ns),
  rustStreak(0.0, 1.78, 0.42),
  bulletHole(0.17, 2.0),
  bulletHole(-0.15, 1.85),
  grimePatch(-0.16, 2.04, 0.18, 0.16),
]);

/** SPEED LIMIT: grimy disc, faded ring, shot through. */
const signSpeed = prop('arena.sign.speed', 'Speed Limit Sign', [
  ...signPost(),
  cyl(0.4, 0.4, 0.06, 16, [0, 1.95, 0], SIGN_WHITE, { rotation: [Math.PI / 2, 0, 0] }),
  { shape: 'torus', args: [0.37, 0.05, 6, 16], position: [0, 1.95, 0.04], color: SIGN_RED, castShadow: false },
  box([0.11, 0.24, 0.02], [-0.09, 1.95, 0.06], SIGN_BLACK, ns),
  box([0.11, 0.24, 0.02], [0.1, 1.95, 0.06], SIGN_BLACK, ns),
  rustStreak(0.21, 1.84, 0.36),
  bulletHole(-0.02, 2.06),
  bulletHole(-0.19, 1.81),
  grimePatch(0.14, 1.77, 0.2, 0.16),
]);

/** DIRECTION: dirty faded-blue panel, peeling arrow, rust-streaked. */
const signArrow = prop('arena.sign.arrow', 'Direction Sign', [
  ...signPost(1.9),
  box([0.9, 0.42, 0.06], [0, 2.05, 0], SIGN_BLUE, ns),
  box([0.42, 0.1, 0.02], [-0.06, 2.05, 0.05], SIGN_WHITE, ns),
  box([0.2, 0.1, 0.02], [0.2, 2.13, 0.05], SIGN_WHITE, { rotation: [0, 0, -Math.PI / 4], castShadow: false }),
  box([0.2, 0.1, 0.02], [0.2, 1.97, 0.05], SIGN_WHITE, { rotation: [0, 0, Math.PI / 4], castShadow: false }),
  rustStreak(-0.3, 2.0, 0.36),
  bulletHole(0.31, 2.1),
  bulletHole(-0.12, 1.99),
  grimePatch(0.18, 1.99, 0.24, 0.16),
]);

// 7-segment digit, drawn from thin black bars on the sign face (z = 0.06). Lets
// us spell numbers (e.g. "62") with primitives — no text geometry needed.
const SEG_T = 0.035;
const segBar = (w: number, h: number, x: number, y: number): PlaceholderPart =>
  box([w, h, 0.02], [x, y, 0.06], SIGN_BLACK, ns);
function digit7(ch: '6' | '2', cx: number, cy: number): PlaceholderPart[] {
  const hw = 0.075; // half-width (left/right verticals)
  const vh = 0.13; // vertical-segment height
  const vy = 0.07; // vertical-segment y offset from center
  const sh = 0.14; // horizontal-segment y offset (top/bottom)
  const A = segBar(0.13, SEG_T, cx, cy + sh); // top
  const G = segBar(0.13, SEG_T, cx, cy); // middle
  const D = segBar(0.13, SEG_T, cx, cy - sh); // bottom
  const F = segBar(SEG_T, vh, cx - hw, cy + vy); // top-left
  const B = segBar(SEG_T, vh, cx + hw, cy + vy); // top-right
  const E = segBar(SEG_T, vh, cx - hw, cy - vy); // bottom-left
  const C = segBar(SEG_T, vh, cx + hw, cy - vy); // bottom-right
  return ch === '6' ? [A, F, G, E, D, C] : [A, B, G, E, D]; // '6' vs '2'
}

/** ROUTE 62: a grimy, shot-up route marker with a faded "62". */
const signRoute62 = prop('arena.sign.route62', 'Route 62 Sign', [
  ...signPost(),
  box([0.7, 0.7, 0.04], [0, 1.97, -0.01], SIGN_BLACK, ns), // border
  box([0.62, 0.62, 0.05], [0, 1.97, 0], SIGN_WHITE, ns), // face
  ...digit7('6', -0.15, 1.95),
  ...digit7('2', 0.15, 1.95),
  rustStreak(0.24, 1.92, 0.42),
  rustStreak(-0.27, 1.86, 0.3),
  bulletHole(0.26, 2.06),
  bulletHole(-0.22, 1.8),
  grimePatch(0.0, 1.7, 0.28, 0.14),
]);

export const PROPS: PropDescriptor[] = [
  house,
  cottage,
  inn,
  smithy,
  tower,
  towerBlue,
  towerRed,
  houseBlue,
  houseRed,
  cottageBlue,
  cottageRed,
  innBlue,
  smithyRed,
  stallBlue,
  stallRed,
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
  // Trailer-park battleground (arena).
  trailer,
  trailerTeal,
  trailerOlive,
  burnedCar,
  scrapPile,
  dumpster,
  rustFence,
  signStop,
  signWarning,
  signSpeed,
  signArrow,
  signRoute62,
  oilDrum,
  fireBarrel,
  trashPile,
  brokenCrate,
  debris,
  tireStack,
];
