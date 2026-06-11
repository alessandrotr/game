import { memo, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { Group } from 'three';
import { getClassDefinition, type CharacterClass } from '@arena/shared';
import { useCharacterStore } from '../store/useCharacterStore';
import { resolveCharacter } from '../assets/CharacterFactory';
import { CharacterModel } from '../render/CharacterModel';

/** Slowly spins its children about Y (used for the lite HUD portrait, which has
 *  no OrbitControls). */
function Spin({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.6;
  });
  return <group ref={ref}>{children}</group>;
}

/** Glowing rune pedestal the champion stands on (Ultima-style circle). */
function Pedestal({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <cylinderGeometry args={[1.35, 1.5, 0.1, 64]} />
        <meshStandardMaterial color="#14151d" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.12, 1.32, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 1, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

/**
 * Rotatable / zoomable 3D showcase of the selected class. Auto-rotates while
 * idle; drag to orbit, scroll/pinch to zoom. Its own R3F canvas, independent of
 * the game scene.
 */
interface ClassPreviewProps {
  characterClass?: CharacterClass;
  /** Cheap auto-rotating bust for an always-on HUD: no shadows, env, contact
   *  shadows, or controls — safe to keep rendering during gameplay. */
  lite?: boolean;
}

function ClassPreviewImpl({ characterClass, lite = false }: ClassPreviewProps) {
  const storeSelected = useCharacterStore((s) => s.selectedClass);
  const selected = characterClass ?? storeSelected;
  const def = getClassDefinition(selected);
  const descriptor = useMemo(() => resolveCharacter(selected), [selected]);

  if (lite) {
    return (
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 1.25, 3.3], fov: 38 }}
        onCreated={({ camera }) => camera.lookAt(0, 1.0, 0)}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 4, 3]} intensity={1.4} color="#fff1d4" />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#8ea8ff" />
        <Spin>
          <group key={selected}>
            <CharacterModel descriptor={descriptor} />
          </group>
          <Pedestal color={def.color} />
        </Spin>
      </Canvas>
    );
  }

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.5, 4], fov: 42 }}>
      <color attach="background" args={['#0a0b12']} />
      <fog attach="fog" args={['#0a0b12', 6, 16]} />

      {/* Lit explicitly (no IBL) — an <Environment> here fetches an HDR from a
          CDN and suspends the whole canvas subtree while it loads, which kept
          OrbitControls (and the model) from ever mounting if the asset was slow
          or blocked. Matte characters don't need it. */}
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[3, 5, 2]}
        intensity={1.6}
        color="#fff1d4"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-4, 2, -3]} intensity={0.8} color="#8ea8ff" />
      <directionalLight position={[0, 3, -5]} intensity={0.5} color="#ffd9a8" />

      {/* Remount on class change so the new model pops in cleanly. */}
      <group key={selected}>
        <CharacterModel descriptor={descriptor} />
      </group>
      <Pedestal color={def.color} />
      <ContactShadows position={[0, 0, 0]} opacity={0.55} scale={6} blur={2.4} far={4} />

      <OrbitControls
        makeDefault
        target={[0, 0.95, 0]}
        enablePan={false}
        enableDamping
        autoRotate
        autoRotateSpeed={0.9}
        minDistance={2.2}
        maxDistance={7}
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
