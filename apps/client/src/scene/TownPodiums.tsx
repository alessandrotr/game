import { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { Color } from 'three';
import { getCosmeticOfType, isCharacterClass, type CharacterClass, type LeaderboardEntry } from '@arena/shared';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { useFocusStore } from '../store/useFocusStore';
import { requestLeaderboard } from '../network/colyseus';
import { resolveCharacter } from '../assets/CharacterFactory';
import { CharacterModel } from '../render/CharacterModel';
import { applyClassPaint, paintTexturesFor } from '../paint/paintSurface';
import { fetchPublicPaint } from '../network/paint';
import { FadeGroup } from './FadeGroup';

/**
 * The town champions' podium — three stepped daises beside the leaderboard
 * tablet showing the current top three. Each tier is capped in its medal color
 * (gold / silver / bronze) with the rank engraved on its face, so the standings
 * read at a glance from across the plaza without opening the dialog. Names are
 * pulled live from the leaderboard store (refreshed on mount); empty slots show
 * a quiet placeholder.
 */

/** Per-rank look: medal color, tier height, where it sits in the classic 2–1–3
 *  podium arrangement, and the height its floating nameplate hovers at. The
 *  nameplates cascade (1st highest → 3rd lowest) so they never stack on top of
 *  one another, mirroring the podium. */
const RANKS = [
  { rank: 1, color: '#f5d061', color2: '#fff6d0', height: 1.4, x: 0, labelY: 2.05 },
  { rank: 2, color: '#cdd3e0', color2: '#ffffff', height: 1.0, x: -1.55, labelY: 1.6 },
  { rank: 3, color: '#cd8c52', color2: '#ffd9a8', height: 0.75, x: 1.55, labelY: 1.35 },
] as const;

/** Block footprint (square). */
const TIER = 1.0;

/** Champions stand on the tiers as figurines — scaled down so a full-height body
 *  reads as a trophy statuette on a 1×1 block rather than a looming giant. */
const MODEL_SCALE = 0.6;
/** Nominal model height (world units) at scale 1 — used to lift the nameplate
 *  clear of the champion's head. Approximate; tune with the scale if models change. */
const MODEL_HEIGHT = 1.8;

/**
 * The champion standing on a tier: their actual class model with equipped skin/dye
 * and custom paint (fetched by account id, like a remote player in the arena). Paint
 * loads onto a podium-scoped surface so it can't collide with the local player's own
 * editable surfaces or an in-town peer's. Falls back to the bare class look until (or
 * unless) paint arrives. Renders nothing for an invalid/guest class.
 */
function PodiumChampion({ entry, tierHeight }: { entry: LeaderboardEntry; tierHeight: number }) {
  const cls = entry.characterClass;
  const descriptor = useMemo(
    () => (isCharacterClass(cls) ? resolveCharacter(cls as CharacterClass, entry.skinId, entry.dyeId) : null),
    [cls, entry.skinId, entry.dyeId],
  );

  // Podium-scoped surface owner: distinct from class ids (local player) and session
  // ids (in-town peers) so the three slots never clash with live surfaces.
  const pid = entry.pid ?? 0;
  const owner = `lb:${pid}:${cls}`;
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    setPainted(false);
    if (!pid || !isCharacterClass(cls)) return;
    let cancelled = false;
    void fetchPublicPaint(pid)
      .then(async (state) => {
        const clsPaint = state[cls as CharacterClass];
        const has = !!clsPaint && Object.keys(clsPaint).length > 0;
        if (has) await applyClassPaint(owner, clsPaint);
        if (!cancelled) setPainted(has);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pid, cls, owner]);

  if (!descriptor) return null;
  // Stand facing the podium's front (the focus camera is positioned to look at that
  // front — see CameraRig's faceYaw framing).
  return (
    <group position={[0, tierHeight + 0.02, 0]} scale={MODEL_SCALE}>
      <CharacterModel descriptor={descriptor} paint={painted ? paintTexturesFor(owner) : undefined} />
    </group>
  );
}

const METAL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Polished metal look: a vertical sheen gradient in the base medal color, a
 *  bright diagonal glint that sweeps across, a faster micro-shimmer, and a soft
 *  edge brighten. Pure-emissive (unlit) so it stays vivid against the dusk town
 *  instead of mirroring the dark environment — and never reads black. */
const METAL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;   // base metal
  uniform vec3 uColor2;  // bright highlight

  void main() {
    vec2 uv = vUv;
    float grad = mix(0.5, 1.05, uv.y);          // brighter toward the top
    vec3 col = uColor * grad;

    float d = uv.x + uv.y;
    float glint = smoothstep(0.74, 1.0, sin(d * 6.2831 - uTime * 2.4));
    col += uColor2 * glint * 0.95;              // sweeping highlight bar

    float shimmer = smoothstep(0.92, 1.0, sin(d * 20.0 - uTime * 4.5));
    col += uColor2 * shimmer * 0.22;            // polished micro-sparkle

    float edge = smoothstep(0.34, 0.5, length(uv - 0.5));
    col += uColor2 * edge * 0.14;               // catch the bevel edges

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The shared gold/silver/bronze shader, used for both a podium's top cap (a box)
 *  and its rank numeral (a troika `<Text>`, which masks the shader by the glyph).
 *  One instance per surface so each animates its own sweep. */
function MetalSurface({ color, color2 }: { color: string; color2: string }) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new Color(color) },
      uColor2: { value: new Color(color2) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    uniforms.uColor.value.set(color);
    uniforms.uColor2.value.set(color2);
  }, [uniforms, color, color2]);
  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
  });
  return (
    <shaderMaterial
      attach="material"
      vertexShader={METAL_VERT}
      fragmentShader={METAL_FRAG}
      uniforms={uniforms}
      toneMapped={false}
    />
  );
}

/** A billboarded nameplate: the player's equipped title (tinted, above) + their
 *  name, matching how titles read above players elsewhere (see PlayerEntity). Read
 *  against the scene via a soft outline (no backing panel — that fought the town).
 *  The podiums are spaced wide and the labels cascade, so plain text doesn't collide. */
function NameLabel({
  name,
  title,
  present,
  y,
}: {
  name: string;
  title?: { text: string; color: string };
  present: boolean;
  y: number;
}) {
  return (
    <Billboard position={[0, y, 0]}>
      {present && title && (
        <Text
          position={[0, 0.26, 0]}
          fontSize={0.12}
          color={title.color}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.008}
          outlineColor="#3a2616"
        >
          {title.text.toUpperCase()}
        </Text>
      )}
      <Text
        fontSize={0.22}
        color={present ? '#e6e9f5' : '#8b91a8'}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.01}
        outlineColor="#3a2616"
        maxWidth={3}
      >
        {name}
      </Text>
    </Billboard>
  );
}

/** A single medal tier: a dark stone block with a metal-tinted top cap, its rank
 *  numeral engraved on the front, and the holder's nameplate cascading above (a
 *  quiet "—" when the slot is empty). */
function Podium({
  rank,
  color,
  color2,
  height,
  x,
  labelY,
  entry,
}: {
  rank: number;
  color: string;
  color2: string;
  height: number;
  x: number;
  labelY: number;
  entry?: LeaderboardEntry;
}) {
  // The player's equipped title (tinted by its cosmetic color), shown above the
  // name like the rest of the game's nameplates. Falls back to the default "Novice"
  // title so a champion who hasn't set one still reads with a rank.
  const title = entry
    ? (entry.titleId && getCosmeticOfType(entry.titleId, 'title')) || getCosmeticOfType('title.novice', 'title')
    : undefined;
  // With a champion standing on the tier, lift the nameplate above their head; an
  // empty slot keeps the lower resting height so the "—" sits on the bare cap.
  const nameY = entry ? height + MODEL_SCALE * MODEL_HEIGHT + 0.28 : labelY;
  return (
    <group position={[x, 0, 0]}>
      {/* Cool polished-slate column. Low metalness (so its own color shows
          instead of mirroring the dark dusk env) + a glossy roughness for crisp
          light highlights + a faint cool emissive so it never sinks to black. */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[TIER, height, TIER]} />
        <meshStandardMaterial
          color="#4a5570"
          roughness={0.38}
          metalness={0.25}
          emissive="#1d2a48"
          emissiveIntensity={0.5}
        />
      </mesh>
      {/* Shiny gold/silver/bronze top cap, slightly proud of the column edges —
          the animated metal shader (sweeping glint) reads as polished medal. */}
      <mesh position={[0, height + 0.015, 0]}>
        <boxGeometry args={[TIER + 0.04, 0.05, TIER + 0.04]} />
        <MetalSurface color={color} color2={color2} />
      </mesh>
      {/* Rank numeral on the front face — same shiny metal shader. */}
      <Text
        position={[0, height * 0.55, TIER / 2 + 0.006]}
        fontSize={height * 0.42}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor="#3a2616"
      >
        {String(rank)}
        <MetalSurface color={color} color2={color2} />
      </Text>
      {/* The champion standing on the tier, in their actual look. */}
      {entry && <PodiumChampion entry={entry} tierHeight={height} />}
      {/* Cascading nameplate billboarded toward the camera. */}
      <NameLabel
        y={nameY}
        present={!!entry}
        name={entry ? entry.name : '—'}
        title={title ? { text: title.text, color: title.color } : undefined}
      />
    </group>
  );
}

interface TownPodiumsProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

/** Podium placement (shared so the leaderboard tablet can aim the focus camera at
 *  the champions). To the right of the tablet and set further back, same facing. */
export const PODIUM_POSITION: [number, number, number] = [11, 0, -4];
export const PODIUM_ROTATION: [number, number, number] = [0, -0.7, 0];

export function TownPodiums({
  position = PODIUM_POSITION,
  rotation = PODIUM_ROTATION,
}: TownPodiumsProps) {
  // The Hall of Champions is always the win leaders, regardless of which tab the
  // dialog currently shows — read the cached `wins` board specifically.
  const entries = useLeaderboardStore((s) => s.boards.wins);
  // Part of the leaderboard monument: fade out when another structure is focused.
  const show = useFocusStore((s) => !s.target || s.panel === 'leaderboard');

  // Pull fresh standings when the town mounts so the podiums show real names
  // without anyone opening the dialog (a no-op until the room is connected; the
  // dialog re-requests on open anyway).
  useEffect(() => {
    requestLeaderboard();
  }, []);

  return (
    <FadeGroup show={show} position={position} rotation={rotation}>
      {/* Shared plinth tying the three tiers together — same cool slate. */}
      <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
        <boxGeometry args={[4.5, 0.16, 1.3]} />
        <meshStandardMaterial
          color="#414b66"
          roughness={0.42}
          metalness={0.25}
          emissive="#18223e"
          emissiveIntensity={0.45}
        />
      </mesh>
      {/* Tiers sit on top of the plinth. */}
      <group position={[0, 0.16, 0]}>
        {RANKS.map((r) => (
          <Podium
            key={r.rank}
            rank={r.rank}
            color={r.color}
            color2={r.color2}
            height={r.height}
            x={r.x}
            labelY={r.labelY}
            entry={entries?.[r.rank - 1]}
          />
        ))}
      </group>
    </FadeGroup>
  );
}
