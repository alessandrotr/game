import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, type Group } from 'three';
import type { VfxAssetId } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { assets } from '../assets/registry';
import { AssetMesh } from '../render/AssetMesh';
import { PROJECTILE_SHADERS } from '../render/shaders';

/** Maps a projectile's source tag (ability kind or auto-attack) to its VFX. */
const ABILITY_VFX: Record<string, VfxAssetId> = {
  fireball: 'vfx.fireball',
  arcane_bolt: 'vfx.arcane_bolt',
  power_shot: 'vfx.power_shot',
  crippling_shot: 'vfx.crippling_shot',
  pinning_arrow: 'vfx.pinning_arrow',
  holy_bolt: 'vfx.holy_bolt',
  auto_bolt: 'vfx.fireball',
  auto_arrow: 'vfx.arrow',
};

/** Interpolation stiffness for projectile motion (1/second). */
const SMOOTHING = 25;

function ProjectileEntity({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const initialized = useRef(false);

  const projectile = useGameStore.getState().projectiles.get(id);
  const vfxId = projectile ? ABILITY_VFX[projectile.ability] : undefined;
  const descriptor = vfxId ? assets.getVfx(vfxId) : undefined;

  useFrame((_, delta) => {
    const node = group.current;
    const latest = useGameStore.getState().projectiles.get(id);
    if (!node || !latest) return;

    if (!initialized.current) {
      node.position.set(latest.x, latest.y, latest.z);
      initialized.current = true;
      return;
    }
    const t = 1 - Math.exp(-SMOOTHING * delta);
    node.position.x = MathUtils.lerp(node.position.x, latest.x, t);
    node.position.z = MathUtils.lerp(node.position.z, latest.z, t);
    node.position.y = latest.y;
  });

  if (!descriptor) return null;
  // Use a custom GLSL projectile shader when one is registered for this VFX;
  // otherwise fall back to the descriptor's placeholder primitives.
  const Shader = vfxId ? PROJECTILE_SHADERS[vfxId] : undefined;
  return (
    <group ref={group}>{Shader ? <Shader /> : <AssetMesh source={descriptor.render} />}</group>
  );
}

/** Renders all in-flight server projectiles, mounting/unmounting on spawn/expire. */
export function Projectiles() {
  const ids = useGameStore((s) => s.projectileIds);
  return (
    <>
      {ids.map((id) => (
        <ProjectileEntity key={id} id={id} />
      ))}
    </>
  );
}
