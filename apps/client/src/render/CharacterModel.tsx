import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  AdditiveBlending,
  Color,
  type AnimationClip,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type SkinnedMesh,
} from 'three';
import type { PaintTextures } from '../paint/paintSurface';
import type {
  AnimationName,
  CharacterDescriptor,
  GltfModel,
  WeaponDescriptor,
} from '@arena/shared';
import { assets } from '../assets/registry';
import { AssetMesh } from './AssetMesh';
import { WoodArrow } from './WoodArrow';
import type { EnchantParams } from './enchantMaterial';
import { AssetErrorBoundary } from './AssetErrorBoundary';
import { useGltfAnimator, useProceduralAnimator } from './animation/useCharacterAnimator';
import { useWeaponCastAnimator, type ChannelState } from './animation/useWeaponCastAnimator';
import { useWeaponSwingAnimator } from './animation/useWeaponSwingAnimator';
import { useBowAnimator } from './animation/useBowAnimator';
import { getAim } from './animation/localAim';
import { getCastAim } from '../store/castAim';
import { weaponGlowPart, type WeaponGlow } from '../assets/weaponGlow';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { getCursorGround } from '../store/cursorState';

/** Sum of char codes — a stable per-character phase offset for procedural motion. */
function seedOf(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return sum;
}

/** Default animation source for static contexts (previews, NPCs) that don't
 *  drive a state machine. */
const ALWAYS_IDLE = (): AnimationName => 'idle';

/** Priest / mage weapon lines — the only ones that get the cast flourish. */
const CASTER_WEAPON = /^weapon\.(staff|mage|mace|priest)/;

/** The glowing showpiece to flare during a cast, or null for non-caster weapons.
 *  Reuses the shared scoring so the flare matches the ability VFX tint. */
function casterGlow(weapon: WeaponDescriptor): WeaponGlow | null {
  if (!CASTER_WEAPON.test(weapon.id)) return null;
  return weaponGlowPart(weapon);
}

/** Root-motion-stripped clips, cached per model URL. Stripping clones every clip
 *  and filters its tracks — doing that per spawned entity (e.g. each zombie)
 *  hitches the frame. The clips are immutable templates, and `useAnimations`
 *  builds its own actions per mixer, so sharing them across instances is safe. */
const STRIPPED_CLIPS = new Map<string, AnimationClip[]>();
function strippedClipsFor(url: string, animations: AnimationClip[]): AnimationClip[] {
  let cached = STRIPPED_CLIPS.get(url);
  if (!cached) {
    cached = animations.map((clip) => {
      const stripped = clip.clone();
      stripped.tracks = stripped.tracks.filter((t) => !t.name.endsWith('.position'));
      return stripped;
    });
    STRIPPED_CLIPS.set(url, cached);
  }
  return cached;
}

interface CharacterModelProps {
  descriptor: CharacterDescriptor;
  /**
   * Source of the current logical animation, polled each frame. Independent of
   * the asset: the same getter drives a procedural placeholder or a rigged GLTF.
   * Defaults to a constant idle so the component is usable without a state machine.
   */
  getAnimation?: () => AnimationName;
  /** Live ground speed (world units/sec); scales the run clip so feet don't slide. */
  getSpeed?: () => number;
  /**
   * Cheap-render mode for crowds (zombie hordes): the body casts NO shadows and
   * is frustum-culled when off-screen, so dozens of rigged bodies don't each add
   * a shadow-pass draw + skinning cost every frame. Off for players (crisp look).
   */
  lightweight?: boolean;
  /** Optional per-player paint texture, mapped onto the body's paintable parts. */
  paint?: PaintTextures;
  /** Procedural motion (idle bob etc.). Set false to hold a still pose — e.g. the
   *  paint studio, where a bobbing body would fight the brush. */
  animate?: boolean;
  /** Equipped weapon enchant (resolved via `resolveEnchant`). Applied to the grip
   *  weapon's showpiece parts; undefined = no enchant. Requires an `EnchantClock`
   *  mounted in the same canvas for animation. */
  enchant?: EnchantParams;
  /** Session id of the player this body represents, used to read their live cast
   *  aim so a caster weapon points down the ability line. Omit for previews/NPCs
   *  (the weapon then thrusts straight ahead on cast). */
  ownerId?: string;
}

/**
 * Assembles a character's body (placeholder primitives or a rigged GLTF) plus
 * its grip weapon, and animates it via the controller. The transform, network
 * smoothing, and labels are the caller's responsibility (see `PlayerEntity`).
 */
export function CharacterModel({
  descriptor,
  getAnimation = ALWAYS_IDLE,
  getSpeed,
  lightweight = false,
  paint,
  animate = true,
  enchant,
  ownerId,
}: CharacterModelProps) {
  const phase = useMemo(() => seedOf(descriptor.id), [descriptor.id]);
  const weapon = descriptor.weaponId ? assets.getWeapon(descriptor.weaponId) : undefined;

  if (descriptor.render.kind === 'gltf') {
    return (
      <group>
        <AssetErrorBoundary label={descriptor.render.url}>
          <Suspense fallback={null}>
            <GltfCharacter
              model={descriptor.render}
              tint={descriptor.tint}
              getAnimation={getAnimation}
              getSpeed={getSpeed}
              phase={phase}
              lightweight={lightweight}
            />
          </Suspense>
        </AssetErrorBoundary>
        {weapon && <WeaponMount weapon={weapon} enchant={enchant} ownerId={ownerId} />}
      </group>
    );
  }

  return (
    <PlaceholderCharacter
      descriptor={descriptor}
      getAnimation={getAnimation}
      phase={phase}
      paint={paint}
      animate={animate}
    >
      {weapon && <WeaponMount weapon={weapon} enchant={enchant} ownerId={ownerId} />}
    </PlaceholderCharacter>
  );
}

/** A weapon mounted in the character's grip transform. Caster weapons (priest /
 *  mage) get a cast flourish; everything else renders statically as before. */
function WeaponMount({
  weapon,
  enchant,
  ownerId,
}: {
  weapon: WeaponDescriptor;
  enchant?: EnchantParams;
  ownerId?: string;
}) {
  const glow = useMemo(() => casterGlow(weapon), [weapon]);
  if (weapon.id.startsWith('weapon.bow') || weapon.id.startsWith('weapon.archer')) {
    return <BowWeaponMount weapon={weapon} enchant={enchant} ownerId={ownerId} />;
  }
  if (!glow) {
    return <MeleeWeaponMount weapon={weapon} enchant={enchant} ownerId={ownerId} />;
  }
  return <CasterWeaponMount weapon={weapon} enchant={enchant} glow={glow} ownerId={ownerId} />;
}

/** Archer bow / crossbow: aims down the shot line and draws-and-looses on a shot
 *  (a nocked arrow shows during the draw and leaves on release); tucks back on a
 *  tumble. */
function BowWeaponMount({
  weapon,
  enchant,
  ownerId,
}: {
  weapon: WeaponDescriptor;
  enchant?: EnchantParams;
  ownerId?: string;
}) {
  const aim = useRef<Group>(null);
  const draw = useRef<Group>(null);
  // Up to 3 nocked arrows (power_shot shows all 3; others show 1).
  const arrow0 = useRef<Group>(null);
  const arrow1 = useRef<Group>(null);
  const arrow2 = useRef<Group>(null);
  const arrows = useMemo(() => [arrow0, arrow1, arrow2], []);
  const getCastAimForOwner = useRef(() => (ownerId ? getCastAim(ownerId) : null)).current;
  // Nocked-arrow draw preview: local from the held key, remote from the replicated
  // charge state — so everyone sees the wind-up.
  const getAimForOwner = useRef(() => getAim(ownerId)).current;
  // The local player aims at frame rate; remote owners' charge dir streams at
  // ~10Hz, so the animator eases their bow instead of stepping it.
  const getLocalOwner = useRef(
    () => !!ownerId && ownerId === useGameStore.getState().sessionId,
  ).current;
  useBowAnimator(aim, draw, arrows, getCastAimForOwner, getAimForOwner, getLocalOwner);
  const gripRot = (weapon.grip?.rotation ?? [0, 0, 0]) as [number, number, number];
  // Pivot OFFSET: the bow models its belly at +Z (the riser, which sits in the
  // hand), but it should rotate around the CHORD (the string / nock, `bulge`
  // behind the belly). Shifting the aim group back by `bulge` makes the chord the
  // pivot while the riser stays at the hand. Crossbow pivots at its stock (0).
  const bulge =
    weapon.id === 'weapon.archer.dawnbow' ? 0 : weapon.id === 'weapon.archer.recurve' ? 0.4 : 0.4;
  // Real wood arrows nocked at the chord (local origin), pointing down the aim
  // (+Z); a slight fan for the three power-shot arrows.
  const arrowPos: [number, number, number][] = [
    [0, 0, 0],
    [0.05, 0, -0.01],
    [-0.05, 0, -0.01],
  ];
  return (
    <group position={weapon.grip?.position ?? [0, 0, 0]} scale={weapon.grip?.scale ?? 1}>
      <group ref={aim} position={[0, 0, -bulge]}>
        <group ref={draw}>
          <group rotation={gripRot}>
            <AssetMesh source={weapon.render} enchant={enchant} />
          </group>
          {/* Nocked wood arrows, shown while drawn; one leaves per shot. */}
          {arrows.map((ref, i) => (
            <group key={i} ref={ref} visible={false} position={arrowPos[i]}>
              <WoodArrow />
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

/** A melee weapon (sword / bow): plain in the grip, but swung in a 180° arc on a
 *  sweeping ability (the warrior's cleave). */
function MeleeWeaponMount({
  weapon,
  enchant,
  ownerId,
}: {
  weapon: WeaponDescriptor;
  enchant?: EnchantParams;
  ownerId?: string;
}) {
  // Swing in the HAND: outer group yaws + lifts (sweep), middle pitches + scales
  // (lay), inner holds the resting grip tilt — which the animator fades out during
  // a gesture so the blade points cleanly (e.g. straight back on a charge).
  const sweep = useRef<Group>(null);
  const lay = useRef<Group>(null);
  const grip = useRef<Group>(null);
  const getCastAimForOwner = useRef(() => (ownerId ? getCastAim(ownerId) : null)).current;
  const gripRot = (weapon.grip?.rotation ?? [0, 0, 0]) as [number, number, number];
  useWeaponSwingAnimator(sweep, lay, grip, getCastAimForOwner, gripRot);
  return (
    <group position={weapon.grip?.position ?? [0, 0, 0]} scale={weapon.grip?.scale ?? 1}>
      <group ref={sweep}>
        <group ref={lay}>
          <group ref={grip} rotation={gripRot}>
            <AssetMesh source={weapon.render} enchant={enchant} />
          </group>
        </group>
      </group>
    </group>
  );
}

/** A priest/mage scepter that swings toward the shot and flares its orb on cast. */
function CasterWeaponMount({
  weapon,
  enchant,
  glow,
  ownerId,
}: {
  weapon: WeaponDescriptor;
  enchant?: EnchantParams;
  glow: WeaponGlow;
  ownerId?: string;
}) {
  const aim = useRef<Group>(null);
  const tip = useRef<Group>(null);
  const flare = useRef<Mesh>(null);
  // This player's latest cast (world aim yaw + a bumped sequence); null in
  // previews / before their first cast.
  const getCastAimForOwner = useRef(() => (ownerId ? getCastAim(ownerId) : null)).current;
  // Live channel state for this player (held abilities like the priest beam), so
  // the scepter holds + re-aims with the beam. Mirrors ChannelBeams' aim source:
  // the live cursor locally, the replicated channel direction for remotes. Only
  // queried during an active channel gesture (see the animator).
  const getChannel = useRef((): ChannelState | null => {
    if (!ownerId) return null;
    const p = useGameStore.getState().players.get(ownerId);
    if (!p || !p.alive || p.channelAbility === '') return null;
    let dx = p.channelDirX;
    let dz = p.channelDirZ;
    if (useGameStore.getState().sessionId === ownerId) {
      const tr = getLocalRenderTransform();
      const ox = tr.active ? tr.x : p.x;
      const oz = tr.active ? tr.z : p.z;
      const cur = getCursorGround();
      const cdx = cur.x - ox;
      const cdz = cur.z - oz;
      const len = Math.hypot(cdx, cdz);
      if (len > 1e-3) {
        dx = cdx / len;
        dz = cdz / len;
      }
    }
    return { yaw: Math.atan2(dx, dz) };
  }).current;
  const getAimForOwner = useRef(() => getAim(ownerId)).current;
  // Local owner aims at frame rate; remote owners' charge dir streams at ~10Hz,
  // so the animator eases their wind-up aim instead of stepping it.
  const getLocalOwner = useRef(
    () => !!ownerId && ownerId === useGameStore.getState().sessionId,
  ).current;
  useWeaponCastAnimator(
    aim,
    tip,
    flare,
    getCastAimForOwner,
    getChannel,
    ownerId,
    getAimForOwner,
    getLocalOwner,
  );

  const gripRotation = weapon.grip?.rotation ?? [0, 0, 0];

  return (
    // Grip placement (translation + scale) in body space, where +Z is facing.
    <group position={weapon.grip?.position ?? [0, 0, 0]} scale={weapon.grip?.scale ?? 1}>
      {/* Aim: yaws the weapon about the hand so +Z points down the ability line. */}
      <group ref={aim}>
        {/* The weapon's resting hand tilt (a Z-roll, which preserves the +Z aim). */}
        <group rotation={gripRotation}>
          {/* Tip: pitches the head forward + lunges along the (now-aimed) +Z. */}
          <group ref={tip}>
            <AssetMesh source={weapon.render} enchant={enchant} />
            {/* Additive light flare at the orb. Hidden (no draw) until a cast fires. */}
            <mesh ref={flare} position={glow.position} visible={false} renderOrder={2}>
              <sphereGeometry args={[glow.radius * 1.6, 8, 8]} />
              <meshBasicMaterial
                color={enchant?.color ?? glow.color}
                transparent
                opacity={0}
                depthWrite={false}
                blending={AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

/** Placeholder body: primitives driven by the procedural animator backend. */
function PlaceholderCharacter({
  descriptor,
  getAnimation,
  phase,
  paint,
  animate = true,
  children,
}: {
  descriptor: CharacterDescriptor;
  getAnimation: () => AnimationName;
  phase: number;
  paint?: PaintTextures;
  animate?: boolean;
  children?: React.ReactNode;
}) {
  const group = useRef<Group>(null);
  useProceduralAnimator(group, getAnimation, phase, animate);
  // The procedural animator rewrites the animated group's transform every frame
  // (including scale), so a model-wide scale rides an OUTER wrapper it never touches.
  const scale = descriptor.render.kind === 'placeholder' ? (descriptor.render.scale ?? 1) : 1;
  return (
    <group scale={scale}>
      <group ref={group}>
        <AssetMesh source={descriptor.render} paint={paint} />
        {children}
      </group>
    </group>
  );
}

/** GLTF body: a cloned instance driven by its embedded clips when present, or a
 *  procedural fallback (idle bob / cast pulse / death) when the model has none. */
function GltfCharacter({
  model,
  tint,
  getAnimation,
  getSpeed,
  phase,
  lightweight = false,
}: {
  model: GltfModel;
  /** Cosmetic body tint (a dye/skin color), blended into the materials. */
  tint?: string;
  getAnimation: () => AnimationName;
  getSpeed?: () => number;
  phase: number;
  lightweight?: boolean;
}) {
  const { scene, animations } = useGLTF(model.url);
  const instance = useMemo(() => {
    const clone = cloneSkinned(scene);
    // Players cast/receive shadows and disable frustum culling on skinned meshes
    // so their shadow isn't dropped when the bind-pose bounds fall outside the
    // shadow camera. Lightweight bodies (zombie hordes) cast NO shadows and STAY
    // frustum-culled, so dozens of them don't each add a shadow draw + skinning
    // cost — and off-screen ones aren't rendered at all.
    clone.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !lightweight;
      mesh.receiveShadow = !lightweight;
      if ((mesh as SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = lightweight;
      // Meshy/AI exports often mark materials fully metallic, which kills diffuse
      // shading (a metal surface only shows reflections, and there's no env map
      // in town) — so they look flat and ignore lights/shadows. Force them matte
      // so they light + receive shadows like the placeholder characters.
      const apply = (mat: MeshStandardMaterial): MeshStandardMaterial => {
        const out = mat.clone() as MeshStandardMaterial;
        if ('metalness' in out) {
          out.metalness = 0.3;
          if (out.roughness < 0.5) out.roughness = 0.8;
        }
        if (out.color && typeof out.color.clone === 'function') {
          out.userData = {
            ...out.userData,
            originalColor: out.color.clone(),
          };
        }
        return out;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => apply(m as MeshStandardMaterial))
        : apply(mesh.material as MeshStandardMaterial);
    });
    return clone;
  }, [scene, lightweight]);

  // Dynamically apply body tint overlay and emissive glow in-place without
  // recreating the cloned instance (which resets animation mixers).
  useEffect(() => {
    const tintColor = tint ? new Color(tint) : null;
    instance.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const updateMaterial = (mat: MeshStandardMaterial) => {
        const originalColor = mat.userData?.originalColor as Color | undefined;
        if (!originalColor) return;
        if (tintColor) {
          mat.color.copy(originalColor).lerp(tintColor, 0.55);
          if (mat.emissive) {
            mat.emissive.copy(tintColor);
            mat.emissiveIntensity = 0.5;
          }
        } else {
          mat.color.copy(originalColor);
          if (mat.emissive) {
            mat.emissive.setScalar(0);
            mat.emissiveIntensity = 0;
          }
        }
      };
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => updateMaterial(m as MeshStandardMaterial));
      } else {
        updateMaterial(mesh.material as MeshStandardMaterial);
      }
    });
  }, [instance, tint]);
  const root = useRef<Group>(null);
  // Play clips IN PLACE: strip root-motion (the hips `.position` track) so the
  // character animates without drifting — its world position is driven by the
  // server/prediction, not the clip. Keeps rotation tracks (the actual motion).
  const inPlace = useMemo(() => strippedClipsFor(model.url, animations), [model.url, animations]);
  const { actions } = useAnimations(inPlace, root);
  const hasClips = inPlace.length > 0;

  const resolveClip = useMemo(() => {
    const clips = model.clips ?? {};
    // Only play explicitly-mapped clips — an unmapped state (e.g. idle for a
    // run-only model) holds a rest pose instead of running in place.
    return (name: AnimationName) => clips[name];
  }, [model.clips]);

  // For a rigged model with no idle clip, hold a frame of its first clip as a
  // standing pose (avoids the bind/T-pose "arms out"). Skipped once idle exists.
  const rest = useMemo(
    () => (model.clips?.idle ? undefined : { clip: inPlace[0]?.name, fraction: 0.15 }),
    [model.clips, inPlace],
  );

  // Rigged models play real clips; clipless models get procedural motion on the
  // root (its transform composes with the primitive's placement offsets below).
  useGltfAnimator(actions, getAnimation, resolveClip, rest, getSpeed);
  useProceduralAnimator(root, getAnimation, phase, !hasClips);

  return (
    <group ref={root}>
      <primitive
        object={instance}
        scale={model.scale ?? 1}
        position={model.offset ?? [0, 0, 0]}
        rotation={[0, model.yaw ?? 0, 0]}
      />
    </group>
  );
}
