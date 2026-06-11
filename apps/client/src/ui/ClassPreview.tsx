import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei';
import { getClassDefinition, type CharacterClass } from '@arena/shared';
import { useCharacterStore } from '../store/useCharacterStore';
import { resolveCharacter } from '../assets/CharacterFactory';
import { CharacterModel } from '../render/CharacterModel';

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
export function ClassPreview({ characterClass }: { characterClass?: CharacterClass } = {}) {
  const storeSelected = useCharacterStore((s) => s.selectedClass);
  const selected = characterClass ?? storeSelected;
  const def = getClassDefinition(selected);
  const descriptor = useMemo(() => resolveCharacter(selected), [selected]);

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.5, 4], fov: 42 }}>
      <color attach="background" args={['#0a0b12']} />
      <fog attach="fog" args={['#0a0b12', 6, 16]} />

      <ambientLight intensity={0.45} />
      <directionalLight
        position={[3, 5, 2]}
        intensity={1.5}
        color="#fff1d4"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-4, 2, -3]} intensity={0.7} color="#6c8cff" />
      <Environment preset="sunset" />

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
