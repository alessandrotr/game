import { Canvas } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import { CharacterController } from './CharacterController';

/**
 * Standalone demo scene for the character controller. Mount this as your root
 * component (or behind a route) to try the controller on its own:
 *
 * ```tsx
 * // apps/client/src/main.tsx
 * import { ControllerDemo } from './controller/ControllerDemo';
 * createRoot(el).render(<ControllerDemo />);
 * ```
 */
export function ControllerDemo() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b0d17' }}>
      <Canvas shadows camera={{ fov: 55, near: 0.1, far: 200, position: [0, 6, 9] }}>
        <color attach="background" args={['#0b0d17']} />
        <fog attach="fog" args={['#0b0d17', 30, 90]} />

        <ambientLight intensity={0.45} />
        <directionalLight
          position={[10, 18, 8]}
          intensity={1.1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />

        {/* Ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#1a1f33" roughness={0.95} />
        </mesh>
        <Grid
          position={[0, 0.01, 0]}
          args={[100, 100]}
          cellSize={1}
          cellColor="#2b3354"
          sectionSize={5}
          sectionColor="#3d4a7a"
          fadeDistance={80}
          infiniteGrid
        />

        {/* Reference obstacles to gauge motion/jumps against. */}
        {(
          [
            [6, -4],
            [-5, 3],
            [2, 8],
          ] as const
        ).map(([x, z], i) => (
          <mesh key={i} position={[x, 0.75, z]} castShadow receiveShadow>
            <boxGeometry args={[1.5, 1.5, 1.5]} />
            <meshStandardMaterial color="#3d4a7a" roughness={0.7} />
          </mesh>
        ))}

        <CharacterController />
      </Canvas>

      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#8b91a8',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
        }}
      >
        WASD move · Shift sprint · Space jump
      </div>
    </div>
  );
}
