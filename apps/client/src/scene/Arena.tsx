import { useEffect, useMemo, useRef } from 'react';
import { Color, MeshStandardMaterial, type Matrix4 } from 'three';
import {
  ARENA_HALF_SIZE,
  ARENA_HALF_Z,
  ARENA_POND,
  ZOMBIE_ROOM_HALF_SIZE,
  generateRoomLayout,
  type PlaceholderPart,
  type Vec3,
  type RoomLayout,
  type SectionBounds,
} from '@arena/shared';
import { mergePlaced, trsMatrix } from '../render/mergeGeometry';
import { MergedGroupMesh } from '../render/MergedGroupMesh';
import { AssetInstance } from '../render/AssetInstance';
import { WaterSurface } from './WaterSurface';
import { useGameStore } from '../store/useGameStore';
import { useEnvStore } from '../tuning/useEnvStore';
import { useFrame } from '@react-three/fiber';

const WALL_HEIGHT = 2.4;
const WALL_THICKNESS = 0.5;

// Stone rampart palette for the arena perimeter walls. The grass floor pulls its
// greens from the Env store (arena.grassDark/Light), matching the town lawn.
const SCRAP = '#7f838c'; // cool UO-Britannia castle stone (matches the town walls)
const SCRAP_DARK = '#585b63'; // dark stone plinth / capstone

// Cheap value-noise + 2-octave fbm — the same lawn variation the town ground uses.
const NOISE_GLSL = /* glsl */ `
  float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gNoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x),
               mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float gFbm(vec2 p){ float v = gNoise(p) * 0.6; v += gNoise(p * 2.02 + 7.3) * 0.3; return v; }
`;

/**
 * The arena's grass floor — the same calm lawn shader the town uses (a 2-octave
 * macro tone + a fine detail sample blended in a narrow band around mid-green),
 * with NO trailer-park stains. One opaque surface, so there's nothing coplanar to
 * z-fight, nothing above y=0 to clip the player's feet, and no overdraw. Beyond
 * the cross-shaped play area it fades to the fog colour.
 */
function DirtGround({ sizeX, sizeZ }: { sizeX: number; sizeZ: number }) {
  const fogColor = useEnvStore((s) => s.arena.fogColor);
  const grassDark = useEnvStore((s) => s.arena.grassDark);
  const grassLight = useEnvStore((s) => s.arena.grassLight);
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ color: new Color(grassLight), roughness: 1, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uGrassDark = { value: new Color(grassDark) };
      shader.uniforms.uGrassLight = { value: new Color(grassLight) };
      shader.uniforms.uFogColor = { value: new Color(fogColor) };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vWorld;\nuniform vec3 uGrassDark;\nuniform vec3 uGrassLight;\nuniform vec3 uFogColor;\n${NOISE_GLSL}`,
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );
            {
              vec2 gp = vWorld.xz;
              float macro = gFbm(gp * 0.06);
              float detail = gNoise(gp * 0.7);
              float t = 0.4 + clamp(macro * 0.7 + detail * 0.3, 0.0, 1.0) * 0.35;
              vec3 col = mix(uGrassDark, uGrassLight, t);
              col *= 0.98 + 0.02 * gNoise(gp * 9.0); // whisper of speckle

              // Beyond the cross-shaped play area, fade to fog.
              bool inCross = (abs(gp.x) <= 25.0 && abs(gp.y) <= 75.0) || (abs(gp.x) <= 75.0 && abs(gp.y) <= 25.0);
              if (!inCross) {
                col = uFogColor;
              }

              diffuseColor.rgb = col;
            }`,
        );
    };
    m.customProgramCacheKey = () => `arena-grass-${grassDark}-${grassLight}-${fogColor}`;
    return m;
  }, [grassDark, grassLight, fogColor]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={material}>
      <planeGeometry args={[sizeX, sizeZ]} />
    </mesh>
  );
}

const fp = (args: Vec3, color: string, extra: Partial<PlaceholderPart> = {}): PlaceholderPart => ({
  shape: 'box',
  args,
  color,
  roughness: 0.9,
  ...extra,
});

/** Build a single wall run as merged parts. */
function wallRun(
  x: number,
  z: number,
  length: number,
  horizontal: boolean,
): { part: PlaceholderPart; matrix: Matrix4 }[] {
  const out: { part: PlaceholderPart; matrix: Matrix4 }[] = [];
  const yaw = horizontal ? 0 : Math.PI / 2;
  const wm = trsMatrix([x, 0, z], [0, yaw, 0]);
  const at = (pos: Vec3, rot?: Vec3) => wm.clone().multiply(trsMatrix(pos, rot));
  const L = length;
  // Solid stone curtain wall (a castle rampart, UO Britannia style).
  out.push({
    part: fp([L, WALL_HEIGHT, WALL_THICKNESS], SCRAP, { roughness: 0.98, metalness: 0 }),
    matrix: at([0, WALL_HEIGHT / 2, 0]),
  });
  // Darker plinth course wrapping the base.
  out.push({
    part: fp([L, 0.5, WALL_THICKNESS + 0.12], SCRAP_DARK, { roughness: 1, castShadow: false }),
    matrix: at([0, 0.25, 0]),
  });
  // Capstone string course just below the battlements.
  out.push({
    part: fp([L, 0.18, WALL_THICKNESS + 0.16], SCRAP_DARK, { roughness: 0.95, receiveShadow: false }),
    matrix: at([0, WALL_HEIGHT + 0.02, 0]),
  });
  // Crenellated battlements: evenly spaced merlons with gaps along the top.
  const step = 1.5; // one merlon + one gap (crenel)
  const merlonW = 0.85;
  const n = Math.max(1, Math.floor(L / step));
  const pad = (L - n * step) / 2;
  for (let i = 0; i < n; i++) {
    const u = -L / 2 + pad + step * (i + 0.5);
    out.push({
      part: fp([merlonW, 0.55, WALL_THICKNESS + 0.06], SCRAP, { roughness: 0.98, castShadow: false }),
      matrix: at([u, WALL_HEIGHT + 0.38, 0]),
    });
  }
  return out;
}

/** All four perimeter walls for the (rectangular, longer-N/S) FFA arena — ready
 *  to be merged. N/S walls sit at ±ARENA_HALF_Z; E/W walls span the longer Z. */
function fenceParts(): { part: PlaceholderPart; matrix: Matrix4 }[] {
  const offX = ARENA_HALF_SIZE + WALL_THICKNESS / 2;
  const offZ = ARENA_HALF_Z + WALL_THICKNESS / 2;
  const lenX = ARENA_HALF_SIZE * 2; // N/S wall length (spans X)
  const lenZ = ARENA_HALF_Z * 2; // E/W wall length (spans the longer Z)
  const out: { part: PlaceholderPart; matrix: Matrix4 }[] = [];
  out.push(...wallRun(0, offZ, lenX + WALL_THICKNESS * 2, true)); // +Z (north)
  out.push(...wallRun(0, -offZ, lenX + WALL_THICKNESS * 2, true)); // -Z (south)
  out.push(...wallRun(offX, 0, lenZ, false)); // +X (east)
  out.push(...wallRun(-offX, 0, lenZ, false)); // -X (west)
  return out;
}

/** Build the outer perimeter + inner section walls for the expanded zombie room. */
function expandedFenceParts(
  layout: RoomLayout,
  unlockedSections: number,
): { part: PlaceholderPart; matrix: Matrix4 }[] {
  const out: { part: PlaceholderPart; matrix: Matrix4 }[] = [];
  const H = ARENA_HALF_SIZE;
  const off = WALL_THICKNESS / 2;

  // Define Main Room as Section -1
  const mainSection: { index: number; boxes: SectionBounds[] } = {
    index: -1,
    boxes: [{ minX: -H, maxX: H, minZ: -H, maxZ: H }],
  };

  const allSections: { index: number; boxes: SectionBounds[] }[] = [mainSection, ...layout.sections];

  // We only draw walls for unlocked sections
  const activeSections = allSections.filter(s => s.index < unlockedSections);

  // Helper to clip a segment by a list of ranges
  const clipSegment = (s1: number, s2: number, clipRanges: [number, number][]): [number, number][] => {
    let segments: [number, number][] = [[s1, s2]];
    for (const [c1, c2] of clipRanges) {
      const nextSegments: [number, number][] = [];
      for (const [start, end] of segments) {
        if (start >= c2 || end <= c1) {
          nextSegments.push([start, end]);
        } else {
          if (start < c1) nextSegments.push([start, c1]);
          if (end > c2) nextSegments.push([c2, end]);
        }
      }
      segments = nextSegments;
    }
    return segments;
  };

  // Process horizontal walls for each active box
  for (const s of activeSections) {
    for (const b of s.boxes) {
      // Bottom edge: z = b.minZ, Top edge: z = b.maxZ. Clips with other boxes in the SAME section.
      const sameSectionBoxes = s.boxes.filter(box => box !== b);
      
      const drawWall = (zCoord: number, isTop: boolean) => {
        // Find clip ranges from same section boxes
        const clipRanges: [number, number][] = [];
        for (const ob of sameSectionBoxes) {
          if (zCoord > ob.minZ - 0.1 && zCoord < ob.maxZ + 0.1) {
            clipRanges.push([ob.minX, ob.maxX]);
          }
        }
        // Also clip by open doors
        for (let dIdx = 0; dIdx < unlockedSections && dIdx < layout.doors.length; dIdx++) {
          const d = layout.doors[dIdx]!;
          if (!d.isVertical && Math.abs(d.z - zCoord) < 0.2) {
            clipRanges.push([d.x - d.width / 2, d.x + d.width / 2]);
          }
        }

        const segments = clipSegment(b.minX, b.maxX, clipRanges);
        for (const [x1, x2] of segments) {
          if (x2 - x1 > 0.5) {
            const len = x2 - x1;
            const center = (x1 + x2) / 2;
            const offsetZ = isTop ? zCoord + off : zCoord - off;
            out.push(...wallRun(center, offsetZ, len, true));
          }
        }
      };

      drawWall(b.minZ, false);
      drawWall(b.maxZ, true);
    }
  }

  // Process vertical walls for each active box
  for (const s of activeSections) {
    for (const b of s.boxes) {
      const sameSectionBoxes = s.boxes.filter(box => box !== b);

      const drawWall = (xCoord: number, isRight: boolean) => {
        const clipRanges: [number, number][] = [];
        for (const ob of sameSectionBoxes) {
          if (xCoord > ob.minX - 0.1 && xCoord < ob.maxX + 0.1) {
            clipRanges.push([ob.minZ, ob.maxZ]);
          }
        }
        // Also clip by open doors
        for (let dIdx = 0; dIdx < unlockedSections && dIdx < layout.doors.length; dIdx++) {
          const d = layout.doors[dIdx]!;
          if (d.isVertical && Math.abs(d.x - xCoord) < 0.2) {
            clipRanges.push([d.z - d.width / 2, d.z + d.width / 2]);
          }
        }

        const segments = clipSegment(b.minZ, b.maxZ, clipRanges);
        for (const [z1, z2] of segments) {
          if (z2 - z1 > 0.5) {
            const len = z2 - z1;
            const center = (z1 + z2) / 2;
            const offsetX = isRight ? xCoord + off : xCoord - off;
            out.push(...wallRun(offsetX, center, len, false));
          }
        }
      };

      drawWall(b.minX, false);
      drawWall(b.maxX, true);
    }
  }

  return out;
}

interface ShroudProps {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  unlocked: boolean;
  color: string;
}

function Shroud({ bounds, unlocked, color }: ShroudProps) {
  const meshRef = useRef<any>(null);
  const opacityRef = useRef(1);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const targetOpacity = unlocked ? 0 : 1;
    if (opacityRef.current !== targetOpacity) {
      const step = delta * 1.5; // Fade out in ~0.66 seconds
      if (opacityRef.current > targetOpacity) {
        opacityRef.current = Math.max(targetOpacity, opacityRef.current - step);
      } else {
        opacityRef.current = Math.min(targetOpacity, opacityRef.current + step);
      }
      meshRef.current.material.opacity = opacityRef.current;
      meshRef.current.visible = opacityRef.current > 0.001;
    }
  });

  const width = Math.max(0.1, bounds.maxX - bounds.minX - 0.6);
  const depth = Math.max(0.1, bounds.maxZ - bounds.minZ - 0.6);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  return (
    <mesh ref={meshRef} position={[cx, 1.25, cz]}>
      <boxGeometry args={[width, 2.5, depth]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={1}
        depthWrite={false}
      />
    </mesh>
  );
}

function ArenaShrouds({ arenaSeed, unlockedSections }: { arenaSeed: number; unlockedSections: number }) {
  const fogColor = useEnvStore((s) => s.arena.fogColor);
  const layout = useMemo(() => generateRoomLayout(arenaSeed), [arenaSeed]);

  return (
    <group>
      {layout.sections.map((section, idx) => (
        <Shroud
          key={section.templateId}
          bounds={section.bounds}
          unlocked={unlockedSections > idx}
          color={fogColor}
        />
      ))}
    </group>
  );
}

// Stone tones for the central pond / island / bridges.
const POND_STONE = '#8a8d94'; // paved island flagstone
const POND_STONE_DK = '#5f636b'; // dark stone rim / curbs
const POND_BRIDGE = '#7c7f86'; // bridge deck stone

/**
 * The fixed central pond (FFA only): a paved stone island ringed by a water moat,
 * crossed by a north (+Z) and a south (−Z) stone bridge with braziers at their
 * mouths. The chest spawns on the island; the moat's impassable collision lives
 * in `generateArenaLayout` (`pondObstacles`), so this is purely the visuals.
 */
function Pond() {
  const { islandR, pondR, bridgeHalfW: bw } = ARENA_POND;
  const bridge = (sign: number) => {
    const inner = islandR - 0.3;
    const outer = pondR + 0.6;
    const len = outer - inner;
    const midZ = sign * (inner + len / 2);
    return (
      <group key={sign}>
        <mesh position={[0, 0.08, midZ]} castShadow receiveShadow>
          <boxGeometry args={[bw * 2 + 0.4, 0.14, len]} />
          <meshStandardMaterial color={POND_BRIDGE} roughness={1} />
        </mesh>
        <mesh position={[bw + 0.18, 0.2, midZ]} castShadow>
          <boxGeometry args={[0.22, 0.28, len]} />
          <meshStandardMaterial color={POND_STONE_DK} roughness={1} />
        </mesh>
        <mesh position={[-(bw + 0.18), 0.2, midZ]} castShadow>
          <boxGeometry args={[0.22, 0.28, len]} />
          <meshStandardMaterial color={POND_STONE_DK} roughness={1} />
        </mesh>
        <group position={[bw + 0.5, 0, sign * (pondR + 0.3)]}>
          <AssetInstance id="prop.arena.drum.fire" />
        </group>
        <group position={[-(bw + 0.5), 0, sign * (pondR + 0.3)]}>
          <AssetInstance id="prop.arena.drum.fire" />
        </group>
      </group>
    );
  };
  return (
    <group position={[ARENA_POND.x, 0, ARENA_POND.z]}>
      {/* Water moat. */}
      <WaterSurface radius={pondR} position={[0, 0.03, 0]} deep="#13384a" shallow="#2f7d98" sky="#bfe6ff" />
      {/* Outer stone rim framing the moat. */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <torusGeometry args={[pondR, 0.35, 6, 48]} />
        <meshStandardMaterial color={POND_STONE_DK} roughness={1} />
      </mesh>
      {/* Paved stone island. */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[islandR, islandR + 0.15, 0.12, 32]} />
        <meshStandardMaterial color={POND_STONE} roughness={1} />
      </mesh>
      {/* Island rim + an inner ring (paved-platform look). */}
      <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[islandR - 0.12, 0.12, 6, 36]} />
        <meshStandardMaterial color={POND_STONE_DK} roughness={1} />
      </mesh>
      <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[islandR * 0.55, 0.08, 6, 28]} />
        <meshStandardMaterial color={POND_STONE_DK} roughness={1} />
      </mesh>
      {bridge(1)}
      {bridge(-1)}
    </group>
  );
}

/** Static arena geometry: a worn-flagstone floor with moss/cracked-stone patches
 *  and four mossy stone ramparts around the perimeter — a ruined keep courtyard.
 *  The ramparts are merged into a few meshes (was ~60 separate draw calls).
 *  Cover (stone ruins, wagons, crates, rubble) is placed as map props, not here. */
export function Arena() {
  const zombieMode = useGameStore((s) => s.zombieMode);
  const unlockedSections = useGameStore((s) => s.unlockedSections);
  const arenaSeed = useGameStore((s) => s.arenaSeed);

  const isExpanded = zombieMode;
  // FFA arena is a rectangle (longer N/S); zombie stays square (expands via rooms).
  const groundX = isExpanded ? ZOMBIE_ROOM_HALF_SIZE * 2 : ARENA_HALF_SIZE * 2;
  const groundZ = isExpanded ? ZOMBIE_ROOM_HALF_SIZE * 2 : ARENA_HALF_Z * 2;

  const fence = useMemo(() => {
    if (!isExpanded) return mergePlaced(fenceParts());
    const layout = generateRoomLayout(arenaSeed);
    return mergePlaced(expandedFenceParts(layout, unlockedSections));
  }, [isExpanded, arenaSeed, unlockedSections]);
  useEffect(() => () => fence.forEach((g) => g.geometry.dispose()), [fence]);

  return (
    <group>
      {/* Packed-dirt floor with its worn patches + oil spills painted into the
          shader (one opaque surface — no decal meshes to z-fight or clip feet). */}
      <DirtGround sizeX={groundX} sizeZ={groundZ} />
      {/* The fixed central pond + island + bridges (FFA only). */}
      {!isExpanded && <Pond />}
      {/* Perimeter hoardings (merged). */}
      {fence.map((g) => (
        <MergedGroupMesh key={g.key} group={g} />
      ))}
      {/* Fog/Dark shrouds for locked sections */}
      {isExpanded && (
        <ArenaShrouds
          arenaSeed={arenaSeed}
          unlockedSections={unlockedSections}
        />
      )}
    </group>
  );
}
