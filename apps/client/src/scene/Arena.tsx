import { useEffect, useMemo, useRef } from 'react';
import { Color, MeshStandardMaterial, type Matrix4 } from 'three';
import {
  ARENA_HALF_SIZE,
  ZOMBIE_ROOM_HALF_SIZE,
  generateRoomLayout,
  type PlaceholderPart,
  type Vec3,
  type DoorDef,
} from '@arena/shared';
import { mergePlaced, trsMatrix } from '../render/mergeGeometry';
import { MergedGroupMesh } from '../render/MergedGroupMesh';
import { useGameStore } from '../store/useGameStore';
import { useEnvStore } from '../tuning/useEnvStore';
import { useFrame } from '@react-three/fiber';

const SIZE = ARENA_HALF_SIZE * 2;
const WALL_HEIGHT = 2.4;
const WALL_THICKNESS = 0.5;

// Gritty junkyard palette (matches the trailer-park props in assets/data/props).
const DIRT = '#5b4f3c';
const DIRT_DARK = '#3f3729';
const OIL = '#221d18';
const SCRAP = '#6f675b';
const SCRAP_DARK = '#474037';
const RUST = '#7c4a2f';
const POST = '#3a342c';

const STAIN_GLSL = /* glsl */ `
  // Soft-edged coverage of a circle (centre c, radius r): 1 inside → 0 outside.
  float gCircle(vec2 p, vec2 c, float r){
    return 1.0 - smoothstep(r - 0.5, r + 0.5, distance(p, c));
  }
`;

/**
 * The packed-dirt arena floor with its worn patches and oil spills painted
 * straight into the shader — one opaque surface, so (unlike separate decal
 * meshes) there's nothing coplanar to z-fight, nothing sitting above y=0 to clip
 * the player's feet, and no overdraw. Each stain blends its colour over the dirt
 * (and compounds where they overlap), matching the old translucent discs.
 */
function DirtGround({ size }: { size: number }) {
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ color: new Color(DIRT), roughness: 1, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uDirtDark = { value: new Color(DIRT_DARK) };
      shader.uniforms.uOil = { value: new Color(OIL) };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vWorld;\nuniform vec3 uDirtDark;\nuniform vec3 uOil;\n${STAIN_GLSL}`,
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );
            {
              vec2 gp = vWorld.xz;
              vec3 col = diffuseColor.rgb;
              // Worn, muddier patches.
              col = mix(col, uDirtDark, 0.55 * gCircle(gp, vec2(9.0, 4.0), 5.0));
              col = mix(col, uDirtDark, 0.55 * gCircle(gp, vec2(-9.0, -4.0), 5.0));
              col = mix(col, uDirtDark, 0.55 * gCircle(gp, vec2(-4.0, 9.0), 4.0));
              col = mix(col, uDirtDark, 0.55 * gCircle(gp, vec2(4.0, -9.0), 4.0));
              col = mix(col, uDirtDark, 0.55 * gCircle(gp, vec2(0.0, 0.0), 6.0));
              // Oil spills.
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(10.0, 5.0), 2.2));
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(-10.0, -5.0), 2.2));
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(-5.0, -9.0), 1.8));
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(5.0, 9.0), 1.8));
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(8.0, 2.0), 1.4));
              col = mix(col, uOil, 0.55 * gCircle(gp, vec2(-8.0, -2.0), 1.4));
              diffuseColor.rgb = col;
            }`,
        );
    };
    m.customProgramCacheKey = () => 'arena-dirt-v1';
    return m;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={material}>
      <planeGeometry args={[size, size]} />
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
  // Corrugated panel run.
  out.push({
    part: fp([L, WALL_HEIGHT, WALL_THICKNESS], SCRAP, { roughness: 0.95, metalness: 0.15 }),
    matrix: at([0, WALL_HEIGHT / 2, 0]),
  });
  // Dark base strip (mud line).
  out.push({
    part: fp([L, 0.6, 0.04], SCRAP_DARK, { roughness: 1, castShadow: false }),
    matrix: at([0, 0.3, WALL_THICKNESS / 2 + 0.01]),
  });
  // Top rail.
  out.push({
    part: fp([L, 0.16, WALL_THICKNESS + 0.12], SCRAP_DARK, {
      roughness: 0.9,
      metalness: 0.2,
      receiveShadow: false,
    }),
    matrix: at([0, WALL_HEIGHT + 0.08, 0]),
  });
  // Rust patches.
  const patchCount = Math.max(1, Math.round(L / 7));
  for (let i = 0; i < patchCount; i++) {
    const u = -L / 2 + L * ((i + 0.5) / patchCount);
    out.push({
      part: fp([1.6 + (i % 3) * 0.7, 0.7 + (i % 2) * 0.5, 0.04], RUST, {
        roughness: 1,
        castShadow: false,
      }),
      matrix: at([u, 0.7 + (i % 2) * 0.7, WALL_THICKNESS / 2 + 0.02]),
    });
  }
  // Leaning support posts.
  const postCount = Math.max(1, Math.round(L / 5));
  for (let i = 0; i <= postCount; i++) {
    const u = -L / 2 + (i * L) / postCount;
    out.push({
      part: fp([0.18, WALL_HEIGHT + 0.5, 0.18], POST, {
        roughness: 0.9,
        metalness: 0.2,
        receiveShadow: false,
      }),
      matrix: at([u, WALL_HEIGHT / 2, WALL_THICKNESS / 2 + 0.12], [i % 2 === 0 ? 0.04 : -0.03, 0, 0]),
    });
  }
  return out;
}

/** Build a wall along a range but skip a door gap at the given position. Returns
 *  two wall segments — one on each side of the gap. */
function wallWithGap(
  start: number,
  end: number,
  gapCenter: number,
  gapWidth: number,
  fixedCoord: number,
  horizontal: boolean,
): { part: PlaceholderPart; matrix: Matrix4 }[] {
  const halfGap = gapWidth / 2;
  const seg1Start = start;
  const seg1End = gapCenter - halfGap;
  const seg2Start = gapCenter + halfGap;
  const seg2End = end;
  const out: { part: PlaceholderPart; matrix: Matrix4 }[] = [];
  if (seg1End > seg1Start + 0.5) {
    const len = seg1End - seg1Start;
    const center = (seg1Start + seg1End) / 2;
    if (horizontal) {
      out.push(...wallRun(center, fixedCoord, len, true));
    } else {
      out.push(...wallRun(fixedCoord, center, len, false));
    }
  }
  if (seg2End > seg2Start + 0.5) {
    const len = seg2End - seg2Start;
    const center = (seg2Start + seg2End) / 2;
    if (horizontal) {
      out.push(...wallRun(center, fixedCoord, len, true));
    } else {
      out.push(...wallRun(fixedCoord, center, len, false));
    }
  }
  return out;
}

/** All four perimeter hoardings — ready to be merged. */
function fenceParts(): { part: PlaceholderPart; matrix: Matrix4 }[] {
  const offset = ARENA_HALF_SIZE + WALL_THICKNESS / 2;
  const out: { part: PlaceholderPart; matrix: Matrix4 }[] = [];
  out.push(...wallRun(0, offset, SIZE + WALL_THICKNESS * 2, true));   // +Z
  out.push(...wallRun(0, -offset, SIZE + WALL_THICKNESS * 2, true));  // -Z
  out.push(...wallRun(offset, 0, SIZE, false));                        // +X
  out.push(...wallRun(-offset, 0, SIZE, false));                       // -X
  return out;
}

/** Build the outer perimeter + inner section walls for the expanded zombie room. */
function expandedFenceParts(
  doors: readonly DoorDef[],
  unlockedSections: number,
): { part: PlaceholderPart; matrix: Matrix4 }[] {
  const out: { part: PlaceholderPart; matrix: Matrix4 }[] = [];
  const H = ARENA_HALF_SIZE;
  const RH = ZOMBIE_ROOM_HALF_SIZE;
  const off = WALL_THICKNESS / 2;

  // --- Outer perimeter of the expanded play area ---
  // Bottom wall (z = -H)
  out.push(...wallRun(0, -H - off, RH * 2 + WALL_THICKNESS * 2, true));
  // Top wall (z = RH)
  out.push(...wallRun(0, RH + off, RH * 2 + WALL_THICKNESS * 2, true));
  // Left wall (x = -RH)
  out.push(...wallRun(-RH - off, (RH - H) / 2, RH + H, false));
  // Right wall (x = RH)
  out.push(...wallRun(RH + off, (RH - H) / 2, RH + H, false));

  // --- Inner walls between sections (with door gaps when unlocked) ---
  const door1 = doors[0];
  if (door1) {
    if (unlockedSections < 1) {
      out.push(...wallRun(-H - off, 0, SIZE, false));
    } else {
      out.push(...wallWithGap(-H, H, door1.z, door1.width, -H - off, false));
    }
  }

  const door4 = doors[3];
  if (door4) {
    if (unlockedSections < 4) {
      out.push(...wallRun(H + off, 0, SIZE, false));
    } else {
      out.push(...wallWithGap(-H, H, door4.z, door4.width, H + off, false));
    }
  }

  const door2 = doors[1];
  if (door2) {
    if (unlockedSections < 2) {
      out.push(...wallRun(-RH + (RH - H) / 2, H + off, RH - H, true));
    } else {
      out.push(...wallWithGap(-RH, -H, door2.x, door2.width, H + off, true));
    }
  }

  const door3 = doors[2];
  if (door3) {
    if (unlockedSections < 3) {
      out.push(...wallRun(0, H + off, SIZE, true));
    } else {
      out.push(...wallWithGap(-H, H, door3.x, door3.width, H + off, true));
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

/** Static arena geometry: a packed-dirt floor with oil stains and four rusted
 *  corrugated-metal hoardings around the perimeter — a fenced-in junkyard lot.
 *  The hoardings are merged into a few meshes (was ~60 separate draw calls).
 *  Cover (trailers, cars, dumpsters, scrap) is placed as map props, not here. */
export function Arena() {
  const zombieMode = useGameStore((s) => s.zombieMode);
  const unlockedSections = useGameStore((s) => s.unlockedSections);
  const arenaSeed = useGameStore((s) => s.arenaSeed);

  const isExpanded = zombieMode;
  const groundSize = isExpanded ? ZOMBIE_ROOM_HALF_SIZE * 2 : SIZE;

  const fence = useMemo(() => {
    if (!isExpanded) return mergePlaced(fenceParts());
    const layout = generateRoomLayout(arenaSeed);
    return mergePlaced(expandedFenceParts(layout.doors, unlockedSections));
  }, [isExpanded, arenaSeed, unlockedSections]);
  useEffect(() => () => fence.forEach((g) => g.geometry.dispose()), [fence]);

  return (
    <group>
      {/* Packed-dirt floor with its worn patches + oil spills painted into the
          shader (one opaque surface — no decal meshes to z-fight or clip feet). */}
      <DirtGround size={groundSize} />
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
