import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import {
  CapsuleCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier';
import type { Group } from 'three';
import { CHARACTER_CLASSES, CLASS_TO_ASSET, type CharacterClass, type Vec3 } from '@arena/shared';
import { useRapierCharacterController } from './useRapierCharacterController';
import { FollowCamera } from './FollowCamera';
import { resolveCharacter } from '../assets/CharacterFactory';
import { assets } from '../assets/registry';
import { CharacterModel } from '../render/CharacterModel';
import { MapView } from '../render/MapView';
import { VfxLayer } from '../render/VfxLayer';
import { useEffectsStore } from '../store/useEffectsStore';
import { effectiveCamera, localMovement, useOverrides } from '../tuning';
import { DevToolsGate } from '../devtools';

// Capsule collider sized to the placeholder characters (feet at the body origin).
const RADIUS = 0.4;
const HALF_HEIGHT = 0.4;
const CENTER_Y = RADIUS + HALF_HEIGHT;

/**
 * A playable character: one of the existing class assets (warrior/mage/archer/
 * priest) mounted inside the Rapier physics controller, with the fireball/heal
 * powers wired to the shared VFX system. Composes the controller hook directly
 * so the ability keys can read the live position/facing.
 */
function PoweredCharacter({ characterClass }: { characterClass: CharacterClass }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<Group>(null);
  const cameraTargetRef = useRef<Group>(null);

  const descriptor = useMemo(() => resolveCharacter(characterClass), [characterClass]);
  // Inject tuned movement values; field names match the controller config 1:1,
  // and the new object identity on each edit makes changes apply live.
  const player = localMovement(
    useOverrides((o) => o),
    characterClass,
  );
  const state = useRapierCharacterController({
    bodyRef,
    visualRef,
    cameraTargetRef,
    // Pass only the fields the controller understands (player tuning also holds
    // click-to-move knobs used by the arena, not this physics controller).
    // Accel/decel come from the controller's own config defaults.
    overrides: {
      walkSpeed: player.walkSpeed,
      sprintSpeed: player.sprintSpeed,
      jumpForce: player.jumpForce,
    },
  });

  // F = fireball forward, R = heal burst — spawned from the live transform.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || !state.current) return;
      const pos = state.current.position;
      const yaw = visualRef.current?.rotation.y ?? 0;
      const forward: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)];

      if (e.code === 'KeyF') {
        useEffectsStore
          .getState()
          .spawn('vfx.fireball', [pos.x + forward[0], 1, pos.z + forward[2]], forward);
      } else if (e.code === 'KeyR') {
        useEffectsStore.getState().spawn('vfx.heal', [pos.x, 0.1, pos.z], [0, 0, 1]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state]);

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        enabledRotations={[false, false, false]}
        position={[0, 4, 2]}
      >
        <CapsuleCollider args={[HALF_HEIGHT, RADIUS]} position={[0, CENTER_Y, 0]} />
        <group ref={visualRef}>
          <CharacterModel descriptor={descriptor} />
        </group>
      </RigidBody>

      <group ref={cameraTargetRef} />
      <TunedFollowCamera target={cameraTargetRef} />
    </>
  );
}

/** Follow camera whose distance/height/smoothing are driven by camera tuning. */
function TunedFollowCamera({ target }: { target: RefObject<Group | null> }) {
  const camera = effectiveCamera(useOverrides((o) => o));
  return (
    <FollowCamera
      target={target}
      offset={[0, camera.height, camera.distance]}
      stiffness={camera.followSmoothing}
    />
  );
}

/**
 * Standalone playground: pick a class, then move it with full physics and cast
 * abilities. Mount as the root component (see `main.tsx`).
 */
export function PoweredCharacterDemo() {
  const [characterClass, setCharacterClass] = useState<CharacterClass>('warrior');

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b0d17' }}>
      {/* Dev-only tuning panels (tree-shaken from production builds). */}
      <DevToolsGate />

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
          {/* Ground: fixed collider with its top surface at y = 0. */}
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[60, 0.5, 60]} position={[0, -0.5, 0]} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[120, 120]} />
              <meshStandardMaterial color="#1a1f33" roughness={0.95} />
            </mesh>
          </RigidBody>
          <Grid
            position={[0, 0.01, 0]}
            args={[120, 120]}
            cellSize={1}
            cellColor="#2b3354"
            sectionSize={5}
            sectionColor="#3d4a7a"
            fadeDistance={90}
            infiniteGrid
          />

          {/* Obstacles to collide with. */}
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

          {/* The existing arena characters/props as decoration (no colliders). */}
          <MapView mapId="map.arena" />

          <PoweredCharacter characterClass={characterClass} />
        </Physics>

        {/* Ability effects (not physical). */}
        <VfxLayer />
      </Canvas>

      {/* HUD: class switcher + controls. */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          display: 'flex',
          gap: 8,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {CHARACTER_CLASSES.map((cls) => (
          <button
            key={cls}
            onClick={() => setCharacterClass(cls)}
            style={{
              width: 'auto',
              padding: '8px 12px',
              cursor: 'pointer',
              borderRadius: 8,
              border: `1px solid ${cls === characterClass ? '#6c8cff' : 'rgba(255,255,255,0.15)'}`,
              background: cls === characterClass ? 'rgba(108,140,255,0.25)' : 'rgba(18,22,40,0.85)',
              color: '#e6e9f5',
              fontWeight: 600,
            }}
          >
            {assets.getCharacter(CLASS_TO_ASSET[cls]).displayName}
          </button>
        ))}
      </div>

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
        WASD move · Shift sprint · Space jump · F fireball · R heal
      </div>
    </div>
  );
}
