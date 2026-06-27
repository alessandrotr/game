import { memo, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { Group } from 'three';
import { getCosmeticOfType, type AnimationName, type CharacterClass } from '@arena/shared';
import { useCharacterStore } from '../store/useCharacterStore';
import { resolveCharacter, resolveEnchant } from '../assets/CharacterFactory';
import { usePaintStore } from '../store/usePaintStore';
import { paintTexturesFor, type PaintTextures } from '../paint/paintSurface';
import { CharacterModel } from '../render/CharacterModel';
import { EnchantClock } from '../render/enchantMaterial';
import { Pedestal } from '../render/Pedestal';

/** Default pedestal color when nothing is equipped (neutral gray, every class). */
const DEFAULT_PEDESTAL_COLOR = '#8b91a8';

/** Slowly spins its children about Y (used for the lite HUD portrait, which has
 *  no OrbitControls). */
function Spin({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.6;
  });
  return <group ref={ref}>{children}</group>;
}

/**
 * Rotatable / zoomable 3D showcase of the selected class. Auto-rotates while
 * idle; drag to orbit, scroll/pinch to zoom. Its own R3F canvas, independent of
 * the game scene.
 */
interface ClassPreviewProps {
  characterClass?: CharacterClass;
  /** Cheap bust for an always-on HUD: no shadows, env, contact shadows, or
   *  controls — safe to keep rendering during gameplay. */
  lite?: boolean;
  /** Auto-rotate the lite bust about Y. Defaults on; pass false for a still pose
   *  (e.g. the combat HUD portrait, where a spinning model is distracting). */
  spin?: boolean;
  /** Equipped/previewed skin cosmetic id (class-bound). */
  skinId?: string;
  /** Equipped/previewed dye cosmetic id (tints the body). */
  dyeId?: string;
  /** Equipped/previewed pedestal cosmetic id (drives its color + shader effect).
   *  Defaults to a neutral gray ring when absent. */
  pedestalId?: string;
  /** Equipped/previewed weapon cosmetic id ('' = the class's base weapon). */
  weaponId?: string;
  /** Equipped/previewed weapon-enchant id ('' = none). */
  enchantId?: string;
  /** Framing for the full (non-lite) showcase. `'center'` keeps the model
   *  centered; `'top'` pulls the camera back and tilts the look-point down so the
   *  whole model sits in the upper part of a full-height canvas, leaving the
   *  lower area clear for overlaid UI. */
  align?: 'center' | 'top';
  /** Skip the opaque canvas background + fog so whatever sits behind the canvas
   *  (e.g. the live town backdrop) shows through around the model. */
  transparent?: boolean;
  /** Logical animation the model plays (e.g. an emote being previewed). Defaults
   *  to idle. The full showcase drives this; the lite bust ignores it. */
  animation?: AnimationName;
  /** Explicit paint textures to apply, overriding the local-player default. Used
   *  by the paperdoll to show ANOTHER player's paint (the caller fetches it). When
   *  omitted, falls back to the local player's own paint for this class — unless
   *  `useOwnPaint` is false. */
  paint?: PaintTextures;
  /** Whether to fall back to the LOCAL player's paint when no explicit `paint` is
   *  given. Defaults true (own showcase). Set false when previewing a PEER (the
   *  paperdoll) so an un-painted peer shows the default skin, not the inspector's. */
  useOwnPaint?: boolean;
}

/** Camera + orbit framing per `align` for the full showcase. `'top'` pulls the
 *  camera back so the model reads smaller inside its (shorter) area above the
 *  bottom UI panel. */
const FRAMING = {
  center: { position: [0, 1.5, 6.8] as const, fov: 40, target: [0, 0.95, 0] as const },
  top: { position: [0, 1.45, 7] as const, fov: 40, target: [0, 0.9, 0] as const },
};

function ClassPreviewImpl({
  characterClass,
  lite = false,
  spin = true,
  skinId,
  dyeId,
  pedestalId,
  weaponId,
  enchantId,
  align = 'center',
  transparent = false,
  animation = 'idle',
  paint: paintOverride,
  useOwnPaint = true,
}: ClassPreviewProps) {
  const storeSelected = useCharacterStore((s) => s.selectedClass);
  const selected = characterClass ?? storeSelected;
  const descriptor = useMemo(
    () => resolveCharacter(selected, skinId, dyeId, weaponId),
    [selected, skinId, dyeId, weaponId],
  );
  const enchant = useMemo(() => resolveEnchant(enchantId), [enchantId]);
  // Stable getter that always reads the latest `animation` prop, so the GLTF
  // animator (which captures the getter once) crossfades to a previewed emote.
  const animRef = useRef(animation);
  animRef.current = animation;
  const getAnimation = useRef(() => animRef.current).current;
  // Reflect custom paint: an explicit override (e.g. a peer's, fetched by the
  // paperdoll) wins; otherwise the local player's own paint for this class.
  const painted = usePaintStore((s) => !!s.customizedByClass[selected]);
  const paint = paintOverride ?? (useOwnPaint && painted ? paintTexturesFor(selected) : undefined);
  // Resolve the equipped pedestal (color + shader effect); a neutral gray ring
  // is the default for every class when nothing is equipped.
  const ped = pedestalId ? getCosmeticOfType(pedestalId, 'pedestal') : undefined;
  const pedColor = ped?.color ?? DEFAULT_PEDESTAL_COLOR;
  const pedEffect = ped?.effect ?? 'ring';
  const pedColor2 = ped?.color2;

  if (lite) {
    const bust = (
      <>
        <group key={selected}>
          <CharacterModel descriptor={descriptor} paint={paint} enchant={enchant} />
        </group>
        <Pedestal effect={pedEffect} color={pedColor} color2={pedColor2} />
      </>
    );
    return (
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 1.25, 6], fov: 38 }}
        onCreated={({ camera }) => camera.lookAt(0, 1.0, 0)}
      >
        <EnchantClock />
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 4, 3]} intensity={1.4} color="#fff1d4" />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#8ea8ff" />
        {spin ? <Spin>{bust}</Spin> : bust}
      </Canvas>
    );
  }

  const frame = FRAMING[align];

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: frame.position, fov: frame.fov }}>
      <EnchantClock />
      {/* Opaque dark stage by default; skipped when `transparent` so a backdrop
          (the live town) shows through around the model. */}
      {!transparent && (
        <>
          <color attach="background" args={['#0a0b12']} />
          <fog attach="fog" args={['#0a0b12', 6, 16]} />
        </>
      )}

      {/* Lit explicitly (no IBL) — an <Environment> here fetches an HDR from a
          CDN and suspends the whole canvas subtree while it loads, which kept
          OrbitControls (and the model) from ever mounting if the asset was slow
          or blocked. Matte characters don't need it. */}
      {/* Neutral-white key + ambient so the model's dye/skin colors read true;
          faint cool/warm rims (low intensity) only shape the form without
          tinting the albedo. */}
      <ambientLight intensity={0.85} color="#ffffff" />
      <directionalLight
        position={[3, 5, 2]}
        intensity={1.5}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-4, 2, -3]} intensity={0.4} color="#cfd8ff" />
      <directionalLight position={[0, 3, -5]} intensity={0.35} color="#ffe6c4" />

      {/* Remount on class change so the new model pops in cleanly. */}
      <group key={selected}>
        <CharacterModel descriptor={descriptor} getAnimation={getAnimation} paint={paint} enchant={enchant} />
      </group>
      <Pedestal effect={pedEffect} color={pedColor} color2={pedColor2} />
      <ContactShadows position={[0, 0, 0]} opacity={0.55} scale={6} blur={2.4} far={4} />

      <OrbitControls
        makeDefault
        target={frame.target}
        enablePan={false}
        enableDamping
        autoRotate={spin}
        autoRotateSpeed={0.9}
        minDistance={2.2}
        maxDistance={8}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2 - 0.04}
      />
    </Canvas>
  );
}

/**
 * Memoized so a parent that re-renders on every server tick (e.g. PlayerCard's
 * ~20 Hz HUD) doesn't reconcile this whole `<Canvas>` subtree each time — its
 * props (`characterClass`, `lite`) are stable, and its own auto-rotate render
 * loop is independent of React.
 */
export const ClassPreview = memo(ClassPreviewImpl);
