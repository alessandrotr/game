import { Canvas } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier';
import { PhysicsCharacterController } from './PhysicsCharacterController';

/**
 * Standalone demo of the Rapier physics character controller. Mount as the root
 * component to try it:
 *
 * ```tsx
 * // apps/client/src/main.tsx
 * import { PhysicsControllerDemo } from './controller/PhysicsControllerDemo';
 * createRoot(el).render(<PhysicsControllerDemo />);
 * ```
 *
 * The character spawns in the air to show gravity, then collides with the
 * ground, walls, and boxes. Add `debug` to `<Physics>` to visualize colliders.
 */
export function PhysicsControllerDemo() {
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

        <Physics gravity={[0, -24, 0]}>
          {/* Ground: fixed body, cuboid collider with its top surface at y = 0. */}
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[50, 0.5, 50]} position={[0, -0.5, 0]} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[100, 100]} />
              <meshStandardMaterial color="#1a1f33" roughness={0.95} />
            </mesh>
          </RigidBody>
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

          {/* Static obstacles to collide with (fixed bodies + cuboid colliders). */}
          {(
            [
              [6, -4],
              [-5, 3],
              [2, 8],
            ] as const
          ).map(([x, z], i) => (
            <RigidBody key={i} type="fixed" position={[x, 0.75, z]} colliders="cuboid">
              <mesh castShadow receiveShadow>
                <boxGeometry args={[1.5, 1.5, 1.5]} />
                <meshStandardMaterial color="#3d4a7a" roughness={0.7} />
              </mesh>
            </RigidBody>
          ))}

          {/* A low wall to test collide-and-slide. */}
          <RigidBody type="fixed" position={[0, 0.5, -6]} colliders="cuboid">
            <mesh castShadow receiveShadow>
              <boxGeometry args={[10, 1, 0.5]} />
              <meshStandardMaterial color="#46527d" roughness={0.8} />
            </mesh>
          </RigidBody>

          {/* Spawn in the air to demonstrate gravity + ground collision. */}
          <PhysicsCharacterController position={[0, 4, 2]} />
        </Physics>
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
