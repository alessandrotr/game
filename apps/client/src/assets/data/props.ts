import { CASTLE, CASTLE_TOWERS } from '@arena/shared';
import type { PlaceholderPart, PropDescriptor, Vec3 } from '@arena/shared';

/**
 * Static world props for a stylized low-poly town. Built entirely from
 * primitives (no texture/GLB downloads) so the look is "intentional low-poly"
 * and stays cheap: small flat decor opts out of shadow casting via `castShadow`.
 * Origin is at each prop's base (y = 0 on the ground).
 */

// --- Palette ---------------------------------------------------------------
const TIMBER = '#5a3f28';
const WOOD = '#6e4b2a';
const WOOD_DARK = '#43301d';
const ROOF_RED = '#9c4636';
const ROOF_BROWN = '#714a2b';
const ROOF_SLATE = '#566079';
const STONE = '#8e887b';
const STONE_DARK = '#6c675b';
const STONE_LIGHT = '#a89f8b';
const GRAY_STONE = '#7d828b'; // cool medieval stone gray (UO Britain) — houses & towers
const FOLIAGE = '#3f8a4a';
const FOLIAGE_DARK = '#2f6d3c';
const PINE = '#2e6b40';
const METAL = '#5f656e';
const WATER = '#3f7fb0';
const WINDOW = '#ffe1a0';
const GLASS_ROOM = '#f2cf94'; // warm lit interior panel (faked, for solid buildings)
const ROOM_WALL = '#d8b88a'; // warm interior wall seen through real window openings
const ROOM_FLOOR = '#6e4b2a'; // warm wooden interior floor
const LANTERN = '#ffd27a';
const CLOTH = '#a23b3b';
// Team accents for the left (blue) / right (red) sides of town.
const TEAM_BLUE = '#3f72c4';
const TEAM_RED = '#c43f3f';

// --- Medieval ruin / arena palette (weathered stone, timber, moss, iron) -----
// NOTE: the constant NAMES are kept from the old trailer-park palette so every
// prop builder still references them — only the COLORS changed, reskinning the
// whole arena from junkyard to fantasy ruin in one place.
const RUST = '#6b6157'; // mossy weathered stone (was rust)
const RUST_DARK = '#463f37'; // dark damp stone / mortar shadow
const SCRAP = '#807a6d'; // dressed grey stone block
const SCRAP_DARK = '#4f4a40'; // dark stone / deep shadow
const SIDING = '#a89f8b'; // pale sandstone wall
const SIDING_TEAL = '#6f8073'; // moss-green weathered stone
const SIDING_OLIVE = '#79795c'; // lichen-stained stone
const CHAR = '#221f1c'; // charred black (burned timber / scorched ruin)
const CAR_WHEEL = '#5c4326'; // wooden cart wheel / axle timber
const GLASS_DK = '#33403c'; // dark recessed window / arrow-slit
const TIRE = '#332b20'; // dark weathered cartwheel timber

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

const pyramid = (r: number, h: number, y: number, color: string): PlaceholderPart =>
  cone(r, h, 4, [0, y, 0], color, { rotation: [0, Math.PI / 4, 0], material: 'tile' });

/**
 * A framed shader-glass window on a building wall. The window sits on the wall
 * selected by `yaw` (0 → +Z front, π → −Z back, ±π/2 → ±X sides); `s` is the
 * lateral offset along that wall, `y` the centre height, and `d` the distance
 * from the prop origin out to the wall face.
 *
 * Returns a transparent glass pane (shared fresnel material — no transmission,
 * so it's cheap) and four dark frame bars around it. When `open` is false the
 * window also gets a warm faked-interior panel behind it (for solid buildings
 * like the inn/tower); when `open` is true the backing is omitted so a real
 * room behind a wall opening shows through. Every piece is pushed PROUD of the
 * wall and offset in depth from its neighbours: coplanar/overlapping faces are
 * what z-fight and shimmer as the camera moves, so nothing shares a plane.
 */
const glassWindow = (
  w: number,
  h: number,
  s: number,
  y: number,
  d: number,
  yaw = 0,
  open = false,
): PlaceholderPart[] => {
  // Outward normal and along-wall tangent for this face.
  const n: [number, number] = [Math.sin(yaw), Math.cos(yaw)];
  const t: [number, number] = [Math.cos(yaw), -Math.sin(yaw)];
  // Place a part at lateral offset `lo`, vertical `vo`, depth `dep` past the wall.
  const at = (lo: number, vo: number, dep: number): Vec3 => [
    t[0] * (s + lo) + n[0] * (d + dep),
    y + vo,
    t[1] * (s + lo) + n[1] * (d + dep),
  ];
  const rot: Vec3 = [0, yaw, 0];
  const bar: P = { castShadow: false, rotation: rot };
  const fy = h / 2 + 0.04;
  const fx = w / 2 + 0.04;
  // Depth (proudness past the wall face at `d`). A hollow wall has a real opening,
  // so the glass RECESSES into it and the frame sits flush with the face; a solid
  // wall has no hole, so the window sits just proud of the surface instead.
  const glassDep = open ? -0.05 : 0.06;
  const frameDep = open ? 0.0 : 0.07;
  return [
    // Faked warm interior panel — only for solid buildings with no real room.
    ...(open
      ? []
      : [
          box([w + 0.02, h + 0.02, 0.04], at(0, 0, 0.0), GLASS_ROOM, {
            emissive: GLASS_ROOM,
            emissiveIntensity: 0.85,
            castShadow: false,
            rotation: rot,
          }),
        ]),
    // Transparent glass pane (recessed in the opening, or just proud on a solid wall).
    box([w, h, 0.04], at(0, 0, glassDep), WINDOW, { material: 'glass', castShadow: false, rotation: rot }),
    // Slim frame: top/bottom run the full width; left/right span only the opening
    // so the four bars butt at the corners instead of overlapping (no z-fight).
    box([w + 0.15, 0.07, 0.06], at(0, fy, frameDep), WOOD_DARK, bar),
    box([w + 0.15, 0.07, 0.06], at(0, -fy, frameDep), WOOD_DARK, bar),
    box([0.07, h, 0.06], at(-fx, 0, frameDep), WOOD_DARK, bar),
    box([0.07, h, 0.06], at(fx, 0, frameDep), WOOD_DARK, bar),
  ];
};

interface Opening {
  cx: number; // centre x along the wall
  cy: number; // centre height
  w: number;
  h: number;
}

/**
 * A wall slab in the +Z plane spanning x∈[-W/2, W/2] and y∈[yBot, yTop], with its
 * outer face at depth `z` and the given thickness, with rectangular `openings`
 * cut out of it. The slab is split into horizontal bands at every opening edge,
 * and within each band a box is emitted for each solid span between openings —
 * giving a wall with real see-through holes, no CSG required.
 */
function holedWall(
  W: number,
  yBot: number,
  yTop: number,
  z: number,
  thickness: number,
  color: string,
  openings: Opening[],
  extra: P = {},
): PlaceholderPart[] {
  const halfW = W / 2;
  const zc = z - thickness / 2; // centre so the outer face lands at depth z
  const ys = [
    ...new Set([
      yBot,
      yTop,
      ...openings.flatMap((o) => [
        Math.max(yBot, o.cy - o.h / 2),
        Math.min(yTop, o.cy + o.h / 2),
      ]),
    ]),
  ].sort((a, b) => a - b);
  const parts: PlaceholderPart[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const ya = ys[i]!;
    const yb = ys[i + 1]!;
    if (yb - ya < 1e-4) continue;
    const my = (ya + yb) / 2;
    const cuts = openings
      .filter((o) => my > o.cy - o.h / 2 && my < o.cy + o.h / 2)
      .map((o) => [o.cx - o.w / 2, o.cx + o.w / 2] as const)
      .sort((a, b) => a[0] - b[0]);
    let x = -halfW;
    for (const [x0, x1] of cuts) {
      if (x0 > x) parts.push(box([x0 - x, yb - ya, thickness], [(x + x0) / 2, my, zc], color, extra));
      x = Math.max(x, x1);
    }
    if (x < halfW)
      parts.push(box([halfW - x, yb - ya, thickness], [(x + halfW) / 2, my, zc], color, extra));
  }
  return parts;
}

const prop = (id: string, displayName: string, parts: PlaceholderPart[]): PropDescriptor => ({
  id: `prop.${id}`,
  displayName,
  render: { kind: 'placeholder', parts },
});

// --- Buildings -------------------------------------------------------------

/**
 * A hollow rectangular storey centred at [0, cy, 0] with size [W, H, D]: a front
 * wall (+Z face) with the given window `openings` cut out, solid back + side
 * walls, and a warm softly-lit interior (back wall + floor) visible through the
 * openings. This is the shared "see into the room" guts used by every windowed,
 * flat-walled building; the caller adds the glass panes (with `open: true`),
 * roof, door, etc. Pass `floor: false` for an upper storey that sits on another,
 * `brick: true` to clad the exterior in the procedural brick pattern, and
 * `room: false` to leave it an empty shell (no lit interior back wall/floor).
 */
function hollowStorey(
  W: number,
  H: number,
  D: number,
  cy: number,
  color: string,
  openings: Opening[],
  floor = true,
  brick = false,
  room = true,
): PlaceholderPart[] {
  const t = 0.16; // wall thickness
  const halfW = W / 2;
  const halfD = D / 2;
  const yBot = cy - H / 2;
  const skin: P = brick ? { material: 'brick' } : {};
  const parts: PlaceholderPart[] = [
    ...holedWall(W, yBot, cy + H / 2, halfD, t, color, openings, skin),
    box([W, H, t], [0, cy, -(halfD - t / 2)], color, skin), // back wall
    box([t, H, D], [-(halfW - t / 2), cy, 0], color, skin), // left wall
    box([t, H, D], [halfW - t / 2, cy, 0], color, skin), // right wall
  ];
  if (room) {
    // Warm, softly-emissive interior back wall — what the eye lands on through
    // the glass. Emissive so the room reads as lit at dusk without paying for a
    // real light per building. Inset to clear the shell (no z-fight).
    parts.push(
      box([W - 2 * t, H, t], [0, cy, -(halfD - 1.6 * t)], ROOM_WALL, {
        emissive: ROOM_WALL,
        emissiveIntensity: 0.5,
        castShadow: false,
        receiveShadow: false,
      }),
    );
  }
  if (floor) {
    parts.push(
      box([W - 2 * t, t, D - 2 * t], [0, yBot + t / 2 + 0.01, 0], ROOM_FLOOR, {
        emissive: ROOM_FLOOR,
        emissiveIntensity: 0.2,
        castShadow: false,
      }),
    );
  }
  return parts;
}

interface HouseOpts {
  footing: Vec3; // [w, h, d] stone base
  wall: Vec3; // [w, h, d] plaster body
  wallColor: string;
  roofR: number;
  roofH: number;
  roofColor: string;
  /** Tudor corner posts (the bigger cottage has them, the small one doesn't). */
  posts?: boolean;
  chimney: Vec3; // [x, y, z] chimney centre
}

/**
 * One reusable cottage, built as a HOLLOW shell: the front wall has real window
 * openings cut into it (see {@link holedWall}) and a warm, softly-lit room sits
 * behind them, so you look through the clear glass into actual 3D interior space
 * — parallax and all — rather than at a flat panel. The back/side walls stay
 * solid. Every house in town uses this, so they're consistent and there's a
 * single place to tweak the look; variety comes from the opts.
 */
function townHouse(id: string, opts: HouseOpts): PropDescriptor {
  const fh = opts.footing[1];
  const wallH = opts.wall[1];
  const W = opts.wall[0];
  const D = opts.wall[2];
  const wy = fh + wallH / 2; // wall centre height
  const halfW = W / 2;
  const halfD = D / 2;
  const roofY = fh + wallH + opts.roofH / 2; // cone centre = wall top + half height
  const winW = 0.5;
  const winH = 0.6;
  const winY = fh + wallH * 0.55; // window centre height
  const winX = (0.375 + halfW) / 2; // midway between the door edge and the corner
  const parts: PlaceholderPart[] = [
    box(opts.footing, [0, fh / 2, 0], STONE),
    // Hollow shell + lit interior, with two window holes in the front wall.
    // Exterior walls are clad in the procedural brick pattern.
    ...hollowStorey(
      W,
      wallH,
      D,
      wy,
      opts.wallColor,
      [
        { cx: -winX, cy: winY, w: winW, h: winH },
        { cx: winX, cy: winY, w: winW, h: winH },
      ],
      true,
      true,
    ),
    pyramid(opts.roofR, opts.roofH, roofY, opts.roofColor),
    // Closed front door (covers solid wall; no opening needed behind it).
    box([0.75, 1.2, 0.08], [0, fh + 0.6, halfD + 0.02], WOOD_DARK),
    // Two see-through windows flanking the door (the `true` drops the fake panel
    // so the real room shows through the hole).
    ...glassWindow(winW, winH, -winX, winY, halfD, 0, true),
    ...glassWindow(winW, winH, winX, winY, halfD, 0, true),
    box([0.45, 1, 0.45], opts.chimney, STONE_DARK),
  ];
  if (opts.posts) {
    // Posts sit proud of the wall so their faces aren't coplanar with the
    // plaster (coplanar faces z-fight); reads as Tudor framing.
    const px = halfW + 0.05;
    const pz = halfD + 0.05;
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      parts.push(box([0.24, wallH, 0.24], [sx * px, wy, sz * pz], TIMBER, { castShadow: false }));
    }
  }
  return prop(id, 'Cottage', parts);
}

const house = townHouse('building.house', {
  footing: [3.2, 0.4, 3.2],
  wall: [2.9, 2, 2.9],
  wallColor: GRAY_STONE, // the bigger house is dirty medieval gray stone
  roofR: 2.55,
  roofH: 1.6,
  roofColor: ROOF_RED,
  posts: true,
  chimney: [0.95, 3.1, -0.7],
});

/** A second cottage variant (slate roof) — same medieval gray stone as the house
 *  so all the brick homes match; variety comes from size and roof colour. */
const cottage = townHouse('building.cottage', {
  footing: [3, 0.4, 2.8],
  wall: [2.7, 1.9, 2.5],
  wallColor: GRAY_STONE,
  roofR: 2.35,
  roofH: 1.5,
  roofColor: ROOF_BROWN,
  chimney: [-0.9, 3, -0.6],
});

// --- Log cabin --------------------------------------------------------------
const LOG = '#9c7445'; // warm natural log timber
const LOG_DARK = '#7c5a33'; // shadowed / alternating log course
const CHINK = '#c3b488'; // pale clay daub packed between the logs
const ROOF_WOOD = '#6e5234'; // wooden plank roof
const DOOR_WOOD = '#7a5832'; // wooden door planks
/** A log cabin: stacked round logs with pale clay chinking and overhanging
 *  notched corners, a flat plank roof on exposed log joists, a framed plank
 *  door, and a stone chimney. Sized as hard cover (~radius 2, old trailer). */
function woodShackParts(opts: { w: number; d: number }): PlaceholderPart[] {
  const fh = 0.28; // low stone footing
  const wallH = 2.2; // ~trailer height (0.28 + 2.2 + roof ≈ 2.8)
  const { w: W, d: D } = opts;
  const halfW = W / 2;
  const halfD = D / 2;
  const wy = fh + wallH / 2;
  const eave = fh + wallH; // wall top
  const beam: P = { castShadow: false };
  const logR = 0.16;
  const over = 0.5; // Lincoln-log crossing overhang (inside the footprint)

  // Inset wall positions: walls sit `over` units inside the collider edge so
  // the log ends extend outward from the inset position and reach exactly to
  // the collider boundary. The crossing happens inside the footprint.
  const wallZ = halfD - over; // front/back log Z position
  const wallX = halfW - over; // side log X position

  // Chinking and footing sized to the inset walls (not the full collider).
  const innerW = W - over * 2;
  const innerD = D - over * 2;
  const parts: PlaceholderPart[] = [
    // Low stone footing + pale clay chinking core (shows in the gaps between logs).
    box([innerW + 0.12, fh, innerD + 0.12], [0, fh / 2, 0], STONE),
    box([innerW - 0.04, wallH, innerD - 0.04], [0, wy, 0], CHINK),
  ];
  // --- Walls of stacked round logs. Front/back run along X, sides along Z and
  // offset half a course so the overhanging ends cross at the corners (notch).
  // Walls are inset so the crossing is inside, with log ends reaching the collider. ---
  const courses = 6;
  const spacing = (wallH - 2 * logR) / (courses - 1);
  for (let c = 0; c < courses; c++) {
    const y = fh + logR + c * spacing;
    const colA = c % 2 === 0 ? LOG : LOG_DARK;
    // Front/back logs: run along X, at the inset Z position; length = innerW + over*2
    // so ends reach from -(wallX + over) = -halfW to +(wallX + over) = +halfW.
    parts.push(cyl(logR, logR, innerW + over * 2, 8, [0, y, wallZ], colA, { rotation: [0, 0, Math.PI / 2] }));
    parts.push(cyl(logR, logR, innerW + over * 2, 8, [0, y, -wallZ], colA, { rotation: [0, 0, Math.PI / 2] }));
    const y2 = y + spacing / 2;
    if (y2 < eave) {
      const colB = c % 2 === 0 ? LOG_DARK : LOG;
      // Side logs: run along Z, at the inset X position; length = innerD + over*2
      // so ends reach from -(wallZ + over) = -halfD to +(wallZ + over) = +halfD.
      parts.push(cyl(logR, logR, innerD + over * 2, 8, [wallX, y2, 0], colB, { rotation: [Math.PI / 2, 0, 0] }));
      parts.push(cyl(logR, logR, innerD + over * 2, 8, [-wallX, y2, 0], colB, { rotation: [Math.PI / 2, 0, 0] }));
    }
  }
  // --- Flat plank roof on exposed log joists (flush with collider) ---
  for (const x of [-wallX + 0.5, -wallX + 1.7, wallX - 1.7, wallX - 0.5]) {
    parts.push(cyl(0.11, 0.11, D, 7, [x, eave + 0.06, 0], LOG_DARK, { rotation: [Math.PI / 2, 0, 0], castShadow: false }));
  }
  parts.push(box([W, 0.16, D], [0, eave + 0.25, 0], ROOF_WOOD)); // solid flat roof slab
  for (const z of [-wallZ + 0.1, 0, wallZ - 0.1]) {
    parts.push(box([W, 0.04, 0.06], [0, eave + 0.34, z], LOG_DARK, beam)); // plank seams
  }
  // --- Plank door, mounted PROUD of the bulging front (+Z) logs so it reads
  // clearly, in a heavy timber frame with iron hinge straps + a handle. ---
  const dW = 1.1;
  const dH = 1.7;
  const dz = wallZ + 0.2; // stand the door out past the inset front log surface
  parts.push(
    // Timber frame: jambs + lintel, standing proud.
    box([0.18, dH + 0.22, 0.26], [-dW / 2 - 0.05, fh + (dH + 0.22) / 2, dz - 0.05], LOG_DARK),
    box([0.18, dH + 0.22, 0.26], [dW / 2 + 0.05, fh + (dH + 0.22) / 2, dz - 0.05], LOG_DARK),
    box([dW + 0.5, 0.22, 0.28], [0, fh + dH + 0.1, dz - 0.05], LOG_DARK),
    // Dark gap behind the door, then the plank door panel.
    box([dW, dH, 0.08], [0, fh + dH / 2, dz - 0.12], '#15110c'),
    box([dW, dH, 0.12], [0, fh + dH / 2, dz], DOOR_WOOD),
    // Vertical plank grooves on the panel.
    box([0.05, dH - 0.1, 0.04], [-0.33, fh + dH / 2, dz + 0.07], '#3a2b1a', beam),
    box([0.05, dH - 0.1, 0.04], [0, fh + dH / 2, dz + 0.07], '#3a2b1a', beam),
    box([0.05, dH - 0.1, 0.04], [0.33, fh + dH / 2, dz + 0.07], '#3a2b1a', beam),
    // Iron hinge straps (top + bottom) + a handle.
    box([dW, 0.11, 0.05], [0, fh + 0.42, dz + 0.07], '#2a2018', beam),
    box([dW, 0.11, 0.05], [0, fh + dH - 0.42, dz + 0.07], '#2a2018', beam),
    box([0.1, 0.16, 0.07], [0.38, fh + dH / 2, dz + 0.09], '#1f1812', beam),
  );
  // --- Stone chimney climbing the back wall ---
  parts.push(
    box([0.62, eave + 0.6, 0.62], [wallX - 0.2, (eave + 0.6) / 2, -wallZ - 0.18], STONE),
    box([0.68, 0.18, 0.68], [wallX - 0.2, eave + 0.55, -wallZ - 0.18], STONE_DARK, beam),
  );
  return parts;
}
// Rectangular like the old trailers (~6.5 long × 2.9 wide); the arena layout adds
// a per-instance 1.0–1.5× length stretch so they're not all the same length.
const shack = prop('building.shack', 'Log Cabin', woodShackParts({ w: 6.5, d: 2.9 }));
const shackSmall = prop('building.shack.small', 'Log Hut', woodShackParts({ w: 4.0, d: 2.4 }));

/** The tavern: two storeys with a jettied upper floor and a hanging sign. Hollow
 *  gray-stone brick with see-through windows — left as an empty shell inside (no
 *  lit interior structure). */
const inn = prop('building.inn', 'The Wandering Inn', [
  box([5.2, 0.4, 4.2], [0, 0.2, 0], STONE),
  // Lower storey — front face at z = 1.9, windows flanking the door.
  ...hollowStorey(
    4.8,
    2,
    3.8,
    1.4,
    GRAY_STONE,
    [
      { cx: -1.6, cy: 1.5, w: 0.7, h: 0.7 },
      { cx: 1.6, cy: 1.5, w: 0.7, h: 0.7 },
    ],
    false,
    true,
    false,
  ),
  // Jettied upper storey — front face at z = 2.1. Sits on the lower storey so it
  // needs no floor of its own.
  ...hollowStorey(
    5.2,
    1.7,
    4.2,
    3.25,
    GRAY_STONE,
    [
      { cx: -1.4, cy: 3.3, w: 0.6, h: 0.6 },
      { cx: 1.4, cy: 3.3, w: 0.6, h: 0.6 },
    ],
    false,
    true,
    false,
  ),
  cone(3.7, 1.9, 4, [0, 5, 0], ROOF_BROWN, { rotation: [0, Math.PI / 4, 0], material: 'tile' }),
  box([1, 1.5, 0.1], [0, 0.95, 1.95], WOOD_DARK),
  ...glassWindow(0.7, 0.7, -1.6, 1.5, 1.9, 0, true),
  ...glassWindow(0.7, 0.7, 1.6, 1.5, 1.9, 0, true),
  ...glassWindow(0.6, 0.6, -1.4, 3.3, 2.1, 0, true),
  ...glassWindow(0.6, 0.6, 1.4, 3.3, 2.1, 0, true),
  box([0.55, 1.1, 0.55], [2, 5, -1.2], STONE_DARK),
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

/** Watchtower with crenellated top, conical roof, and a banner. Dirty gray
 *  stone masonry on the base + shaft. */
const tower = prop('building.tower', 'Watchtower', [
  box([3, 0.6, 3], [0, 0.3, 0], GRAY_STONE, { material: 'brick' }),
  cyl(1.3, 1.5, 5, 12, [0, 3, 0], GRAY_STONE, { material: 'brick' }),
  cyl(1.65, 1.65, 0.7, 12, [0, 5.6, 0], STONE_DARK),
  cone(1.75, 2, 12, [0, 6.9, 0], ROOF_SLATE, { material: 'tile' }),
  ...glassWindow(0.3, 0.7, 0, 3, 1.5),
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
  // Stone drum (solid, top at 0.7). The water sits ABOVE this top and below the
  // raised rim, so no two faces are coplanar (the old basin z-fought because the
  // water top and the drum top were both at y=0.9).
  cyl(1.0, 1.1, 0.7, 12, [0, 0.35, 0], STONE),
  cyl(0.86, 0.86, 0.06, 16, [0, 0.73, 0], WATER, {
    castShadow: false,
    roughness: 0.3,
    metalness: 0.2,
  }),
  // Raised stone rim ring framing the water (open centre, so the water shows).
  {
    shape: 'torus',
    args: [0.96, 0.16, 8, 18],
    position: [0, 0.78, 0],
    rotation: [Math.PI / 2, 0, 0],
    color: STONE,
    castShadow: false,
  },
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

/** A round tower for the castle: tapered masonry shaft, a corbelled crenellated
 *  cap, and a steep conical roof. Sized by base radius `r` and shaft height `h`. */
const castleTower = (x: number, z: number, r = 1.6, h = 8.5): PlaceholderPart[] => [
  cyl(r * 0.86, r, h, 14, [x, h / 2, z], GRAY_STONE, { material: 'brick' }),
  cyl(r * 1.18, r * 1.18, 0.8, 14, [x, h + 0.4, z], STONE_DARK), // overhanging battlement
  cone(r * 1.22, r * 1.9, 14, [x, h + 0.8 + (r * 1.9) / 2, z], ROOF_SLATE, { material: 'tile' }),
];

/** Lord British's castle: a WALKABLE walled courtyard. Curtain walls with a
 *  gate opening at the front (facing town, +z), four corner towers, and a keep
 *  set against the back wall — so players can walk in through the gate and roam
 *  the bailey. The collision ring in TOWN_OBSTACLES (centred on the castle's
 *  world position) mirrors these walls with a matching gap at the gate. */
/** A crenellated cap rim atop a curtain wall (battlement look without the cost
 *  of dozens of individual merlon teeth). */
const battlement = (size: Vec3, pos: Vec3): PlaceholderPart => box(size, pos, STONE_DARK);
const C = CASTLE;
const KEEP_Z = -C.halfZ + 3; // keep centre, set against the back wall
const castle = prop('castle', "Lord British's Castle", [
  // Raised plinth + flush courtyard floor you walk on inside.
  box([C.halfX * 2 + 1.2, 0.3, C.halfZ * 2 + 1.2], [0, 0.15, 0], STONE_DARK),
  box([C.halfX * 2 - 0.4, 0.12, C.halfZ * 2 - 0.4], [0, 0.36, 0], STONE),
  // Front curtain wall with the gate cut out (brick masonry), facing +z.
  ...holedWall(
    C.halfX * 2,
    0,
    C.wallH,
    C.halfZ,
    C.wallT,
    GRAY_STONE,
    [{ cx: 0, cy: C.gateH / 2, w: C.gateW, h: C.gateH }],
    { material: 'brick' },
  ),
  // Back + side curtain walls (solid).
  box([C.halfX * 2, C.wallH, C.wallT], [0, C.wallH / 2, -C.halfZ], GRAY_STONE, { material: 'brick' }),
  box([C.wallT, C.wallH, C.halfZ * 2], [-C.halfX, C.wallH / 2, 0], GRAY_STONE, { material: 'brick' }),
  box([C.wallT, C.wallH, C.halfZ * 2], [C.halfX, C.wallH / 2, 0], GRAY_STONE, { material: 'brick' }),
  // Battlement cap rims along each wall top.
  battlement([C.halfX * 2 + 0.3, 0.5, C.wallT + 0.25], [0, C.wallH + 0.1, C.halfZ]),
  battlement([C.halfX * 2 + 0.3, 0.5, C.wallT + 0.25], [0, C.wallH + 0.1, -C.halfZ]),
  battlement([C.wallT + 0.25, 0.5, C.halfZ * 2 + 0.3], [-C.halfX, C.wallH + 0.1, 0]),
  battlement([C.wallT + 0.25, 0.5, C.halfZ * 2 + 0.3], [C.halfX, C.wallH + 0.1, 0]),
  // Looming keep against the back wall — leaves the front bailey open to walk in.
  box([6, 9.5, 6], [0, 4.75, KEEP_Z], GRAY_STONE, { material: 'brick' }),
  box([6.8, 0.8, 6.8], [0, 9.9, KEEP_Z], STONE_DARK), // keep battlement
  box([3.4, 1.4, 3.4], [0, 11, KEEP_Z], GRAY_STONE, { material: 'brick' }), // upper turret
  cone(2.8, 3.6, 4, [0, 13.4, KEEP_Z], ROOF_SLATE, { rotation: [0, Math.PI / 4, 0], material: 'tile' }),
  // Glowing glass windows up the keep face, toward the courtyard.
  ...glassWindow(0.7, 1.1, -1.5, 4, KEEP_Z + 3),
  ...glassWindow(0.7, 1.1, 1.5, 4, KEEP_Z + 3),
  ...glassWindow(0.7, 1.1, -1.5, 7, KEEP_Z + 3),
  ...glassWindow(0.7, 1.1, 1.5, 7, KEEP_Z + 3),
  // Towers — corners, mid-wall and gate — from the shared spec.
  ...CASTLE_TOWERS.flatMap((t) => castleTower(t.x, t.z, t.r, t.h)),
  // Banners flanking the gate.
  box([0.06, 1.8, 0.6], [-C.gateW / 2 - 0.2, 3, C.halfZ + 0.15], CLOTH, { castShadow: false }),
  box([0.06, 1.8, 0.6], [C.gateW / 2 + 0.2, 3, C.halfZ + 0.15], CLOTH, { castShadow: false }),
]);

/** A ~5u crenellated stone wall segment (tileable along the city perimeter). */
const wall = prop('wall', 'City Wall', [
  box([5, 2.6, 0.9], [0, 1.3, 0], STONE),
  box([0.7, 0.5, 0.95], [-1.6, 2.85, 0], STONE_DARK, { castShadow: false }),
  box([0.7, 0.5, 0.95], [0, 2.85, 0], STONE_DARK, { castShadow: false }),
  box([0.7, 0.5, 0.95], [1.6, 2.85, 0], STONE_DARK, { castShadow: false }),
]);

// --- Ruined-keep battleground (arena) --------------------------------------
//
// Same primitive-only, flat-shaded approach as the town above, but weathered:
// mossed stone, slate roofs, charred timber, scattered rubble. Big pieces
// (stone ruins, wrecked wagons, supply crates, rubble heaps, keg clusters) are
// COVER and MUST have a matching collision circle in `ARENA_LAYOUTS.trailerpark`
// (packages/shared/src/constants.ts) — exactly like the town keeps props in
// sync with TOWN_OBSTACLES. Small flat litter (rubble, debris, crates,
// cartwheels, fences) is decorative-only and opts out of collision and shadows.

const ns: P = { castShadow: false };

/** A ruined stone cottage: dressed-stone walls with a broken, toothed top, a
 *  partly collapsed slate gable roof (open over one end, exposed beams), a dark
 *  doorway with a stone lintel, an arrow-slit window, moss, and spilled rubble.
 *  ~5u long. `siding` selects the stone tone (sandstone / moss / lichen). */
const trailerParts = (siding: string): PlaceholderPart[] => [
  box([5, 0.4, 2.5], [0, 0.2, 0], STONE_DARK), // foundation plinth
  box([4.8, 1.7, 2.4], [0, 1.25, 0], siding), // main walls (the cover mass)
  box([0.45, 0.18, 2.46], [0, 0.45, 0], STONE_DARK, ns), // plinth course line
  // Tall standing gable end-wall fragment (the roof rests against it).
  box([0.45, 1.2, 2.4], [-2.2, 2.2, 0], siding),
  // Broken wall teeth at the collapsed (+x) end — uneven so it reads as a ruin.
  box([0.5, 0.4, 0.5], [1.4, 2.3, 0.95], siding, ns),
  box([0.45, 0.28, 0.5], [1.95, 2.24, -0.9], siding, ns),
  box([0.4, 0.22, 0.5], [1.9, 2.18, 0.9], siding, ns),
  // Slate gable roof — only over the −x half; the +x end is open to the sky.
  box([3.2, 0.16, 1.5], [-0.55, 2.42, 0.6], ROOF_SLATE, { rotation: [-0.46, 0, 0], castShadow: false }),
  box([3.2, 0.16, 1.5], [-0.55, 2.42, -0.6], ROOF_SLATE, { rotation: [0.46, 0, 0], castShadow: false }),
  box([3.35, 0.16, 0.2], [-0.55, 2.74, 0], WOOD_DARK, ns), // ridge beam
  // Exposed rafters jutting over the collapsed end.
  cyl(0.06, 0.06, 2.4, 6, [1.35, 2.0, 0.0], WOOD_DARK, { rotation: [Math.PI / 2, 0, 0.12], castShadow: false }),
  cyl(0.06, 0.06, 2.2, 6, [1.75, 1.8, 0.0], WOOD_DARK, { rotation: [Math.PI / 2, 0, -0.1], castShadow: false }),
  // Doorway (dark recess) with a heavy stone lintel, front (+z) wall.
  box([1.0, 1.3, 0.14], [1.0, 0.95, 1.16], GLASS_DK),
  box([1.25, 0.24, 0.36], [1.0, 1.72, 1.1], STONE_DARK, ns),
  // Narrow arrow-slit window with a stone surround.
  box([0.26, 0.72, 0.14], [-1.5, 1.4, 1.17], GLASS_DK),
  box([0.42, 0.16, 0.32], [-1.5, 1.86, 1.1], STONE_DARK, ns),
  // Moss / lichen staining down the stone.
  box([0.5, 1.2, 0.06], [-2.41, 1.2, 0.4], RUST, ns),
  box([0.4, 0.9, 0.06], [2.41, 1.0, -0.4], RUST, ns),
  // Rubble spilling from the collapsed end.
  sph(0.4, [2.4, 0.35, 0.6], STONE, { scale: [1.3, 0.7, 1.1], castShadow: false }),
  sph(0.3, [2.55, 0.26, -0.45], STONE_DARK, ns),
  box([0.5, 0.45, 0.5], [2.2, 0.42, -0.85], siding, { rotation: [0.2, 0.4, 0.3], castShadow: false }), // fallen block
];
const trailer = prop('arena.trailer', 'Stone Ruin', trailerParts(SIDING));
const trailerTeal = prop('arena.trailer.teal', 'Stone Ruin', trailerParts(SIDING_TEAL));
const trailerOlive = prop('arena.trailer.olive', 'Stone Ruin', trailerParts(SIDING_OLIVE));

/** A spoked wooden cart wheel (ring + hub + crossed spokes), upright with its
 *  axle along local Z. Static cover, so it isn't tagged `wheel` (no roll). */
// Parts tagged `name: 'wheel'` are spun about their axle by CoverStructureEntity
// as the wagon rolls (the torus + spokes turn together; the hub is symmetric so
// it stays put). The torus axle is local Z, matching the renderer's roll axis.
const cartWheel = (p: Vec3): PlaceholderPart[] => [
  { shape: 'torus', args: [0.42, 0.07, 8, 18], position: p, color: CAR_WHEEL, castShadow: false, name: 'wheel' },
  cyl(0.09, 0.09, 0.18, 8, p, WOOD_DARK, { rotation: [Math.PI / 2, 0, 0], castShadow: false }), // hub
  box([0.06, 0.8, 0.05], p, WOOD, { name: 'wheel', castShadow: false }), // spoke (vertical)
  box([0.8, 0.06, 0.05], p, WOOD, { name: 'wheel', castShadow: false }), // spoke (horizontal)
];

const TNT_RED = '#c33529'; // bright dynamite red
const TNT_BAND = '#1c1714'; // black binding band
const FUSE = '#15110d'; // dark fuse cord
/** A bundle of red dynamite sticks (7 in a hex cluster) bound by two black bands,
 *  with a couple of lit fuses poking out the top. Sits on the wagon bed. */
const dynamiteBundle = (cx: number, cz: number): PlaceholderPart[] => {
  const bed = 0.91; // wagon bed top
  const h = 0.85;
  const r = 0.12;
  const sticks: [number, number][] = [
    [0, 0], [0.26, 0], [-0.26, 0], [0.13, 0.22], [-0.13, 0.22], [0.13, -0.22], [-0.13, -0.22],
  ];
  const parts: PlaceholderPart[] = sticks.map(([dx, dz], i) => {
    const sh = h + (i % 3) * 0.07; // slight height variation across the bundle
    return cyl(r, r, sh, 8, [cx + dx, bed + sh / 2, cz + dz], TNT_RED);
  });
  parts.push(
    // Two black bands wrapping the bundle (horizontal rings).
    { shape: 'torus', args: [0.42, 0.06, 6, 16], position: [cx, bed + 0.26, cz], rotation: [Math.PI / 2, 0, 0], color: TNT_BAND, castShadow: false },
    { shape: 'torus', args: [0.42, 0.06, 6, 16], position: [cx, bed + 0.62, cz], rotation: [Math.PI / 2, 0, 0], color: TNT_BAND, castShadow: false },
    // Lit fuses + a spark.
    cyl(0.025, 0.025, 0.32, 5, [cx + 0.06, bed + h + 0.1, cz], FUSE, { rotation: [0.35, 0, 0.25], castShadow: false }),
    cyl(0.025, 0.025, 0.28, 5, [cx - 0.08, bed + h + 0.08, cz + 0.06], FUSE, { rotation: [-0.3, 0, -0.2], castShadow: false }),
    sph(0.07, [cx + 0.14, bed + h + 0.3, cz], '#ffd24a', { emissive: '#ffb020', emissiveIntensity: 1.4, castShadow: false }),
  );
  return parts;
};
/** A powder wagon: an intact open-topped plank cart on four spoked wheels, loaded
 *  with a bundle of red dynamite. Catches fire and blows up when shot (its id
 *  contains 'car', so it gets the smoke/fire VFX). */
const burnedCar = prop('arena.car.burned', 'Powder Wagon', [
  // Plank bed + full side/end rails.
  box([3.0, 0.22, 1.6], [0, 0.8, 0], WOOD),
  box([3.0, 0.5, 0.14], [0, 1.05, 0.73], WOOD_DARK),
  box([3.0, 0.5, 0.14], [0, 1.05, -0.73], WOOD_DARK),
  box([0.14, 0.5, 1.6], [-1.5, 1.05, 0], WOOD_DARK),
  box([0.14, 0.5, 1.6], [1.5, 1.05, 0], WOOD_DARK),
  box([3.0, 0.04, 0.07], [0, 0.92, 0.32], WOOD_DARK, ns), // bed plank seam
  box([3.0, 0.04, 0.07], [0, 0.92, -0.32], WOOD_DARK, ns),
  // Four spoked wheels.
  ...cartWheel([1.05, 0.45, 0.82]),
  ...cartWheel([1.05, 0.45, -0.82]),
  ...cartWheel([-1.05, 0.45, 0.82]),
  ...cartWheel([-1.05, 0.45, -0.82]),
  // Red dynamite bundles lashed to the bed.
  ...dynamiteBundle(-0.45, 0.05),
  ...dynamiteBundle(0.6, -0.1),
]);

/** A heap of twisted scrap: corrugated sheets, a bent pipe, a steel offcut. */
const scrapPile = prop('arena.scrap', 'Rubble Heap', [
  box([2, 0.6, 1.6], [0, 0.3, 0], SCRAP_DARK, ns), // base mound
  box([1.8, 1.4, 0.08], [0.2, 0.95, 0.2], SCRAP, { rotation: [0.2, 0.3, 0.15] }), // leaning sheet
  box([1.5, 1.2, 0.08], [-0.3, 0.85, -0.3], RUST, { rotation: [-0.15, -0.4, -0.2] }), // leaning sheet
  box([0.6, 0.6, 0.6], [0.5, 0.45, -0.45], SCRAP, { rotation: [0.2, 0.5, 0.1] }), // steel chunk
  cyl(0.1, 0.1, 1.8, 8, [0.4, 0.55, 0.6], SCRAP, { rotation: [0, 0, 1.3], castShadow: false }), // pipe
  box([0.09, 0.09, 1.4], [-0.4, 0.5, 0.4], RUST_DARK, { rotation: [0.3, 0.6, 0.2], castShadow: false }), // twisted bar
]);

/** A rusted dumpster with one lid flopped open — solid mid-size cover. */
const dumpster = prop('arena.dumpster', 'Supply Crate', [
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
const rustFence = prop('arena.fence.rust', 'Broken Palisade', [
  cyl(0.07, 0.08, 1.8, 6, [-0.95, 0.9, 0], SCRAP_DARK, ns), // post
  cyl(0.07, 0.08, 1.8, 6, [0.95, 0.9, 0], SCRAP_DARK, ns), // post
  box([1.9, 1.3, 0.05], [0, 0.95, 0], RUST, ns), // corrugated panel
  box([0.4, 1.3, 0.06], [0.5, 0.95, 0.01], SCRAP, ns), // lighter panel patch
  box([2, 0.08, 0.08], [0, 1.62, 0], SCRAP_DARK, ns), // top rail
]);

/** A medieval battlefield palisade: a row of sharpened timber stakes lashed by
 *  cross-rails, braced from behind — ~3u long, used as destructible cover. */
const palisadeParts = (): PlaceholderPart[] => {
  const parts: PlaceholderPart[] = [
    cyl(0.14, 0.14, 3.0, 8, [0, 0.2, 0], WOOD_DARK, { rotation: [0, 0, Math.PI / 2] }), // base sill
  ];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const x = -1.35 + (2.7 * i) / (n - 1);
    const col = i % 2 === 0 ? WOOD : WOOD_DARK;
    parts.push(cyl(0.17, 0.17, 1.7, 7, [x, 0.9, 0], col)); // stake
    parts.push(cone(0.17, 0.34, 7, [x, 1.92, 0], col, { castShadow: false })); // sharpened tip
  }
  parts.push(
    cyl(0.09, 0.09, 2.9, 7, [0, 1.5, 0.17], WOOD_DARK, { rotation: [0, 0, Math.PI / 2], castShadow: false }), // front rail
    cyl(0.09, 0.09, 2.9, 7, [0, 0.72, -0.16], WOOD_DARK, { rotation: [0, 0, Math.PI / 2], castShadow: false }), // back rail
    cyl(0.11, 0.11, 1.8, 6, [-0.85, 0.8, -0.4], WOOD, { rotation: [0.7, 0, 0], castShadow: false }), // back strut
    cyl(0.11, 0.11, 1.8, 6, [0.85, 0.8, -0.4], WOOD, { rotation: [0.7, 0, 0], castShadow: false }), // back strut
  );
  return parts;
};
const palisade = prop('arena.palisade', 'Palisade Wall', palisadeParts());

/** A bulged wooden barrel (powder keg / water cask): tapered staves that swell
 *  at the middle, bound by three iron hoops, with a plank lid. */
const oilDrum = prop('arena.drum', 'Powder Keg', [
  cyl(0.42, 0.34, 0.5, 12, [0, 0.25, 0], WOOD), // lower staves (widen toward middle)
  cyl(0.34, 0.42, 0.5, 12, [0, 0.75, 0], WOOD), // upper staves (taper to the rim)
  cyl(0.3, 0.3, 0.05, 12, [0, 1.0, 0], WOOD_DARK, ns), // plank lid
  { shape: 'torus', args: [0.43, 0.045, 6, 14], position: [0, 0.5, 0], rotation: [Math.PI / 2, 0, 0], color: METAL, castShadow: false }, // middle hoop
  { shape: 'torus', args: [0.37, 0.04, 6, 14], position: [0, 0.16, 0], rotation: [Math.PI / 2, 0, 0], color: METAL, castShadow: false }, // bottom hoop
  { shape: 'torus', args: [0.37, 0.04, 6, 14], position: [0, 0.86, 0], rotation: [Math.PI / 2, 0, 0], color: METAL, castShadow: false }, // top hoop
]);

/** A burning barrel — the charred drum body; the flame itself is a procedural
 *  shader (scene/BarrelEntity → BarrelFire). ArenaLights drops a warm point
 *  light at each one (keep placements in sync with scene/ArenaLights.tsx). */
const fireBarrelParts = (): PlaceholderPart[] => {
  const parts: PlaceholderPart[] = [
    // Lower staves (widen toward middle)
    cyl(0.46, 0.38, 0.5, 12, [0, 0.25, 0], '#832f27'),
    // Upper staves (taper to the rim)
    cyl(0.38, 0.46, 0.5, 12, [0, 0.75, 0], '#832f27'),
    // Plank lid (recessed slightly to create a rim)
    cyl(0.34, 0.34, 0.03, 12, [0, 0.98, 0], '#5a1f19', ns),

    // Rusted iron bands (top and bottom only, leaving the middle clear for the badge)
    { shape: 'torus', args: [0.40, 0.04, 6, 14], position: [0, 0.16, 0], rotation: [Math.PI / 2, 0, 0], color: METAL, castShadow: false },
    { shape: 'torus', args: [0.40, 0.04, 6, 14], position: [0, 0.84, 0], rotation: [Math.PI / 2, 0, 0], color: METAL, castShadow: false },

    // --- Explosion Symbol Badge (on the +Z front face) ---
    // Dark brown backing board
    box([0.36, 0.36, 0.02], [0, 0.5, 0.47], '#3d2d1e', ns),
    
    // Outer yellow spiky burst
    box([0.20, 0.20, 0.01], [0, 0.5, 0.48], '#e6b010', { rotation: [0, 0, Math.PI / 4], castShadow: false }),
    box([0.12, 0.24, 0.01], [-0.04, 0.52, 0.48], '#e6b010', { rotation: [0, 0, 0.25], castShadow: false }),
    box([0.12, 0.24, 0.01], [0.04, 0.52, 0.48], '#e6b010', { rotation: [0, 0, -0.25], castShadow: false }),
    box([0.10, 0.26, 0.01], [0, 0.55, 0.48], '#e6b010', ns),

    // Inner red/orange burst
    box([0.10, 0.10, 0.01], [0, 0.46, 0.485], '#a83c18', { rotation: [0, 0, Math.PI / 4], castShadow: false }),
    box([0.06, 0.12, 0.01], [0, 0.49, 0.485], '#a83c18', ns),

    // Orange main color base with subtle orange glow
    cyl(0.30, 0.30, 0.02, 10, [0, 0.99, 0], '#ff5500', { emissive: '#ff3300', emissiveIntensity: 1.2, castShadow: false }),
  ];

  // Deterministic seed random generator so the layout is constant
  const seedRandom = (s: number) => {
    return () => {
      s = Math.sin(s) * 10000;
      return s - Math.floor(s);
    };
  };
  const rand = seedRandom(88);

  // Add 6 flat splats (dark red and black) to texture the fire bed
  for (let i = 0; i < 6; i++) {
    const angle = rand() * Math.PI * 2;
    const r = rand() * 0.24; // keep inset from the rim
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = 1.001 + rand() * 0.003; // prevent z-fighting
    const rad = 0.08 + rand() * 0.08;
    const isRed = rand() < 0.5; // 50% red, 50% black
    if (isRed) {
      parts.push(
        cyl(rad, rad, 0.004, 6, [x, y, z], '#6e0d05', {
          emissive: '#4a0703',
          emissiveIntensity: 2.2,
          castShadow: false,
        })
      );
    } else {
      parts.push(
        cyl(rad, rad, 0.004, 6, [x, y, z], '#111111', { castShadow: false })
      );
    }
  }

  // Add 24 small coals on top
  for (let i = 0; i < 24; i++) {
    const angle = rand() * Math.PI * 2;
    const r = rand() * 0.28; // keep within the rim
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    // Pile up slightly in the center, sitting on top of the textured bed
    const y = 1.006 + (1.0 - r / 0.28) * 0.025 + rand() * 0.008;
    const size = 0.015 + rand() * 0.02;

    const glowRand = rand();
    if (glowRand < 0.45) {
      // 45% glowing coals with temperature variation
      const isExtraHot = glowRand < 0.15; // some super hot yellow/orange embers
      const color = isExtraHot ? '#ff8a00' : '#a81c10';
      const emissive = isExtraHot ? '#ff6c00' : '#ff3b00';
      const intensity = isExtraHot ? 4.0 : 2.5;

      parts.push(
        sph(size, [x, y, z], color, {
          emissive,
          emissiveIntensity: intensity,
          castShadow: false,
        })
      );
    } else {
      parts.push(
        sph(size, [x, y, z], '#111111', ns)
      );
    }
  }

  return parts;
};

const fireBarrel = prop('arena.drum.fire', 'Powder Keg', fireBarrelParts());

const epicBrazierParts = (): PlaceholderPart[] => {
  const parts: PlaceholderPart[] = [
    // Flat wide square stone base slab
    box([0.7, 0.08, 0.7], [0, 0.04, 0], RUST_DARK),

    // Tapered square stone pillar (top radius 0.22, bottom radius 0.3, height 0.5, rotated 45deg)
    cyl(0.22, 0.3, 0.5, 4, [0, 0.33, 0], RUST, { rotation: [0, Math.PI / 4, 0] }),

    // Flat square stone cap slab
    box([0.52, 0.08, 0.52], [0, 0.62, 0], RUST_DARK),

    // Circular metal neck
    cyl(0.2, 0.2, 0.06, 8, [0, 0.69, 0], METAL),

    // Metal bowl/basket tapering outwards
    cyl(0.42, 0.2, 0.2, 8, [0, 0.82, 0], METAL),
  ];

  // Pointy metal spikes/teeth around the rim
  const rimRadius = 0.42;
  const topY = 0.92;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const x = Math.cos(angle) * rimRadius;
    const z = Math.sin(angle) * rimRadius;
    // A little metal cone spike pointing up
    parts.push(cone(0.04, 0.16, 4, [x, topY + 0.06, z], METAL));
  }

  // Crisscrossed logs inside the bowl
  parts.push(
    cyl(0.05, 0.05, 0.5, 6, [0.06, 0.92, 0], CHAR, { rotation: [0.3, 0.5, 0.8] }),
    cyl(0.05, 0.05, 0.5, 6, [-0.06, 0.92, 0], CHAR, { rotation: [-0.3, -0.5, 0.8] }),
  );

  // Orange glowing main coal bed base
  parts.push(
    cyl(0.28, 0.28, 0.02, 10, [0, 0.93, 0], '#ff5500', {
      emissive: '#ff3300',
      emissiveIntensity: 1.5,
      castShadow: false,
    })
  );

  // Coals seed random
  const seedRandom = (s: number) => {
    return () => {
      s = Math.sin(s) * 10000;
      return s - Math.floor(s);
    };
  };
  const rand = seedRandom(99);

  // Add 35 small coals (black & glowing) in the bowl
  for (let i = 0; i < 35; i++) {
    const angle = rand() * Math.PI * 2;
    const r = rand() * 0.28;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = 0.935 + (1.0 - r / 0.28) * 0.02 + rand() * 0.005;
    const size = 0.025 + rand() * 0.02;
    const isGlowing = rand() < 0.45;
    if (isGlowing) {
      parts.push(
        sph(size, [x, y, z], '#ffaa00', {
          emissive: '#ff5500',
          emissiveIntensity: 3.5,
          castShadow: false,
        })
      );
    } else {
      parts.push(
        sph(size, [x, y, z], '#222222', ns)
      );
    }
  }

  // Add animated fire shader part directly to the prop's definition
  parts.push(cone(0.34, 1.2, 10, [0, 1.48, 0], '#ff5500', { material: 'fire' }));

  return parts;
};

const epicBrazier = prop('arena.brazier', 'Epic Brazier', epicBrazierParts());



/** A stacked woodpile (chopped firewood) with a couple of mossy stones. Decorative. */
const trashPile = prop('arena.trash', 'Woodpile', [
  cyl(0.12, 0.12, 0.95, 7, [0, 0.15, 0.12], LOG, { rotation: [Math.PI / 2, 0, 0], castShadow: false }),
  cyl(0.12, 0.12, 0.95, 7, [0.02, 0.15, -0.14], LOG_DARK, { rotation: [Math.PI / 2, 0, 0], castShadow: false }),
  cyl(0.12, 0.12, 0.95, 7, [0, 0.38, -0.01], LOG, { rotation: [Math.PI / 2, 0, 0.04], castShadow: false }),
  sph(0.28, [0.6, 0.18, 0.2], STONE, { scale: [1.2, 0.7, 1.0], castShadow: false }),
  sph(0.2, [-0.52, 0.13, -0.28], STONE_DARK, ns),
]);



/** A stack of old cartwheels. Decorative. */
const tireStack = prop('arena.tires', 'Cartwheels', [
  {
    shape: 'torus',
    args: [0.7, 0.3, 8, 12],
    position: [0, 0.3, 0],
    rotation: [Math.PI / 2, 0, 0],
    color: TIRE,
    castShadow: false,
  },
  {
    shape: 'torus',
    args: [0.7, 0.3, 8, 12],
    position: [0.08, 0.84, 0.07],
    rotation: [Math.PI / 2, 0.2, 0],
    color: TIRE,
    castShadow: false,
  },
  {
    shape: 'torus',
    args: [0.7, 0.3, 8, 12],
    position: [-0.05, 1.38, -0.05],
    rotation: [Math.PI / 2, -0.15, 0],
    color: TIRE,
  },
]);

// --- Standing stones & heraldry (arena) ------------------------------------
// Fantasy waymarkers that replace the old dead-city road signs: weathered
// timber posts, carved runestones, heraldic banners, a round shield and a
// wooden signpost. The layout places each at a random yaw and a crooked lean.
// (The prop ids are unchanged — only the meshes/colors were reskinned.)
const SIGN_POST = '#4f3f2c'; // weathered timber post
const SIGN_RED = '#8a3b34'; // faded heraldic crimson
const SIGN_WHITE = '#cdbfa3'; // pale carved stone / bleached linen
const SIGN_YELLOW = '#b8902f'; // tarnished gold / ochre
const SIGN_BLUE = '#36506e'; // faded heraldic blue
const SIGN_BLACK = '#221e18'; // dark iron / charcoal device
const SIGN_RUST = '#4a5a36'; // moss / lichen run-off streak
const SIGN_HOLE = '#161412'; // chipped recess / weathered pit
const SIGN_GRIME = '#2c281f'; // dark water stain
/** A weathered timber post with an iron/moss collar. */
const signPost = (h = 1.8): PlaceholderPart[] => [
  cyl(0.05, 0.06, h, 6, [0, h / 2, 0], SIGN_POST, ns),
  cyl(0.065, 0.065, 0.12, 6, [0, h * 0.45, 0], SIGN_RUST, ns), // moss collar
];

// --- Weathering decals (drawn on the face, z just in front) ---
/** A vertical moss / lichen run-off streak. */
const rustStreak = (x: number, y: number, h: number): PlaceholderPart =>
  box([0.05, h, 0.012], [x, y, 0.066], SIGN_RUST, ns);
/** A chipped-out recess / weathered pit. */
const bulletHole = (x: number, y: number): PlaceholderPart =>
  cyl(0.05, 0.05, 0.06, 7, [x, y, 0.04], SIGN_HOLE, { rotation: [Math.PI / 2, 0, 0], castShadow: false });
/** A dark water-stain patch. */
const grimePatch = (x: number, y: number, w: number, h: number): PlaceholderPart =>
  box([w, h, 0.012], [x, y, 0.064], SIGN_GRIME, ns);
/** A carved rune mark — a few incised strokes on a stone/wood face. */
const runeMark = (cx: number, cy: number): PlaceholderPart[] => [
  box([0.04, 0.32, 0.02], [cx, cy, 0.06], SIGN_BLACK, ns), // stem
  box([0.2, 0.04, 0.02], [cx + 0.03, cy + 0.09, 0.06], SIGN_BLACK, { rotation: [0, 0, -0.6], castShadow: false }),
  box([0.2, 0.04, 0.02], [cx + 0.03, cy - 0.07, 0.06], SIGN_BLACK, { rotation: [0, 0, 0.6], castShadow: false }),
];

// An octagon (8-seg cylinder) faces forward via PI/2 about X; the SECOND euler
// (local Y, which becomes the facing axis after that turn) rolls it a
// half-segment so a flat edge sits on top — a clean octagonal slab, in plane.
const OCTA_FACING: Vec3 = [Math.PI / 2, Math.PI / 8, 0];

/** RUNESTONE: a carved octagonal boundary stone, mossed and chipped. */
const signStop = prop('arena.sign.stop', 'Runestone', [
  ...signPost(),
  cyl(0.47, 0.47, 0.05, 8, [0, 1.95, -0.01], SCRAP_DARK, { rotation: OCTA_FACING, castShadow: false }),
  cyl(0.42, 0.42, 0.07, 8, [0, 1.95, 0.01], SCRAP, { rotation: OCTA_FACING }),
  ...runeMark(0, 1.95),
  rustStreak(0.18, 1.85, 0.5),
  rustStreak(-0.22, 1.92, 0.32),
  bulletHole(-0.1, 2.04),
  bulletHole(0.15, 1.79),
  grimePatch(0.02, 1.72, 0.32, 0.18),
]);

/** BANNER: a faded heraldic lozenge with a dark charge, wind-worn. */
const signWarning = prop('arena.sign.warning', 'Heraldic Banner', [
  ...signPost(),
  box([0.58, 0.58, 0.06], [0, 1.95, 0], SIGN_YELLOW, { rotation: [0, 0, Math.PI / 4] }),
  box([0.07, 0.26, 0.02], [0, 2.0, 0.05], SIGN_BLACK, ns),
  box([0.07, 0.07, 0.02], [0, 1.8, 0.05], SIGN_BLACK, ns),
  rustStreak(0.0, 1.78, 0.42),
  bulletHole(0.17, 2.0),
  bulletHole(-0.15, 1.85),
  grimePatch(-0.16, 2.04, 0.18, 0.16),
]);

/** ROUND SHIELD: a painted heraldic shield with an iron rim and a cross. */
const signSpeed = prop('arena.sign.speed', 'Round Shield', [
  ...signPost(),
  cyl(0.4, 0.4, 0.06, 16, [0, 1.95, 0], SIGN_RED, { rotation: [Math.PI / 2, 0, 0] }),
  { shape: 'torus', args: [0.37, 0.05, 6, 16], position: [0, 1.95, 0.04], color: SIGN_BLACK, castShadow: false },
  box([0.5, 0.1, 0.02], [0, 1.95, 0.06], SIGN_WHITE, ns), // cross — bar
  box([0.1, 0.5, 0.02], [0, 1.95, 0.06], SIGN_WHITE, ns), // cross — stem
  rustStreak(0.21, 1.84, 0.36),
  bulletHole(-0.02, 2.06),
  bulletHole(-0.19, 1.81),
  grimePatch(0.14, 1.77, 0.2, 0.16),
]);

/** SIGNPOST: a weathered wooden wayfinding board with a carved arrow. */
const signArrow = prop('arena.sign.arrow', 'Wooden Signpost', [
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

/** WAYSTONE: a squared stone marker carved with a rune, mossed and chipped. */
const signRoute62 = prop('arena.sign.route62', 'Waystone', [
  ...signPost(),
  box([0.7, 0.7, 0.04], [0, 1.97, -0.01], SCRAP_DARK, ns), // stone border
  box([0.62, 0.62, 0.05], [0, 1.97, 0], SCRAP, ns), // stone face
  ...runeMark(0, 1.97),
  rustStreak(0.24, 1.92, 0.42),
  rustStreak(-0.27, 1.86, 0.3),
  bulletHole(0.26, 2.06),
  bulletHole(-0.22, 1.8),
  grimePatch(0.0, 1.7, 0.28, 0.14),
]);

export const PROPS: PropDescriptor[] = [
  house,
  cottage,
  shack,
  shackSmall,
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
  palisade,
  signStop,
  signWarning,
  signSpeed,
  signArrow,
  signRoute62,
  oilDrum,
  fireBarrel,
  epicBrazier,
  trashPile,
  tireStack,
];

const CHEST_WOOD = '#5c4033'; // Dark brown wood
const CHEST_METAL = '#3a3d40'; // Iron bands/locks
const CHEST_GOLD = '#d4af37'; // Golden latch

/** Treasure Chest: A medieval chest model optimized for performance. */
const treasureChest = prop('arena.chest', 'Treasure Chest', [
  // Base wood box (dimensions: 2x1, height 1.0, position center at y=0.5)
  box([2, 1.0, 1], [0, 0.5, 0], CHEST_WOOD),

  // Curved lid: horizontal cylinder along X (length 2, diameter 1 -> topRadius=0.5, bottomRadius=0.5, rotated on Z)
  cyl(0.5, 0.5, 2.0, 12, [0, 1.0, 0], CHEST_WOOD, { rotation: [0, 0, Math.PI / 2] }),

  // Iron bands wrapping the base box (left, middle, right)
  box([0.1, 1.04, 1.04], [-0.9, 0.5, 0], CHEST_METAL, ns),
  box([0.1, 1.04, 1.04], [0, 0.5, 0], CHEST_METAL, ns),
  box([0.1, 1.04, 1.04], [0.9, 0.5, 0], CHEST_METAL, ns),

  // Iron bands wrapping the curved lid (left, middle, right)
  cyl(0.52, 0.52, 0.12, 12, [-0.9, 1.0, 0], CHEST_METAL, { rotation: [0, 0, Math.PI / 2], castShadow: false }),
  cyl(0.52, 0.52, 0.12, 12, [0, 1.0, 0], CHEST_METAL, { rotation: [0, 0, Math.PI / 2], castShadow: false }),
  cyl(0.52, 0.52, 0.12, 12, [0.9, 1.0, 0], CHEST_METAL, { rotation: [0, 0, Math.PI / 2], castShadow: false }),

  // Lock clasp plate on front face (z = 0.52)
  box([0.2, 0.3, 0.06], [0, 0.7, 0.52], CHEST_METAL, ns),
  // Gold latch hanging from lid down to base
  box([0.08, 0.2, 0.04], [0, 0.85, 0.54], CHEST_GOLD, ns),
  // Keyhole detail
  box([0.04, 0.08, 0.03], [0, 0.65, 0.55], '#000000', ns),
]);

PROPS.push(treasureChest);
