import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, type Group } from 'three';
import { ABILITIES, isAbilityKind, isPickableKind, type VfxAssetId } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { assets } from '../assets/registry';
import { AssetMesh } from '../render/AssetMesh';
import { PROJECTILE_SHADERS } from '../render/shaders';
import { abilityTintColor, abilityMuzzleOffset } from '../assets/CharacterFactory';
import { getLocalRenderTransform } from '../store/localPlayer';
import { PickableVisual } from './PickableVisual';

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
  bullet: 'vfx.bullet',
  ninja_w: 'vfx.shuriken',
  shuriken: 'vfx.shuriken',
};

/** Interpolation stiffness for projectile motion (1/second). */
const SMOOTHING = 25;

function ProjectileEntity({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const initialized = useRef(false);
  // True while a muzzle-launched bolt is still easing its height onto the path.
  const launched = useRef(false);

  const projectile = useGameStore.getState().projectiles.get(id);
  // Thrown pickables (molotov / grenade) render their object mesh, tumbling in
  // flight; ability/auto projectiles use their VFX descriptor + shader.
  const thrownKind = projectile && isPickableKind(projectile.ability) ? projectile.ability : undefined;
  const vfxId = projectile && !thrownKind ? ABILITY_VFX[projectile.ability] : undefined;
  const descriptor = vfxId ? assets.getVfx(vfxId) : undefined;
  // Recolor the bolt to the firing player's equipped weapon glow (null = default).
  const owner = projectile ? useGameStore.getState().players.get(projectile.ownerId) : undefined;
  const tint = owner
    ? abilityTintColor(owner.characterClass, owner.weaponId, owner.enchantId) ?? undefined
    : undefined;

  useFrame((_, delta) => {
    const node = group.current;
    const latest = useGameStore.getState().projectiles.get(id);
    if (!node || !latest) return;

    if (!initialized.current) {
      initialized.current = true;
      // Launch from the caster's scepter tip (orb), then lerp onto the server
      // trajectory — so the bolt visibly comes out of the weapon. Falls back to
      // the server spawn point for weapons with no showpiece.
      const off = owner && !thrownKind ? abilityMuzzleOffset(owner.characterClass, owner.weaponId) : null;
      let yaw = owner?.rotation ?? 0;
      if (off && owner) {
        launched.current = true;
        let ox = owner.x;
        let oz = owner.z;
        const local = getLocalRenderTransform();
        if (local.active && useGameStore.getState().sessionId === projectile?.ownerId) {
          ox = local.x;
          oz = local.z;
          yaw = local.rotation;
        }
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);
        node.position.set(ox + off[0] * cos + off[2] * sin, off[1], oz - off[0] * sin + off[2] * cos);
      } else {
        node.position.set(latest.x, latest.y, latest.z);
      }
      // Point oriented projectiles (arrows) down their initial heading.
      if (!thrownKind) node.rotation.y = yaw;
      return;
    }
    const t = 1 - Math.exp(-SMOOTHING * delta);
    // Orient along travel (arrows fly point-first); billboards ignore this.
    if (!thrownKind) {
      const dx = latest.x - node.position.x;
      const dz = latest.z - node.position.z;
      if (dx * dx + dz * dz > 1e-6) node.rotation.y = Math.atan2(dx, dz);
    }
    node.position.x = MathUtils.lerp(node.position.x, latest.x, t);
    node.position.z = MathUtils.lerp(node.position.z, latest.z, t);
    // Ease the launch height (orb → trajectory) on muzzle-launched bolts; thrown
    // arcs and ordinary projectiles take the server height directly.
    if (launched.current) {
      node.position.y = MathUtils.lerp(node.position.y, latest.y, t);
      if (Math.abs(node.position.y - latest.y) < 0.02) launched.current = false;
    } else {
      node.position.y = latest.y;
    }
    if (thrownKind) {
      node.rotation.x = node.rotation.y += delta * 6; // tumble
    } else if (latest.ability === 'ninja_w' || latest.ability === 'shuriken') {
      node.rotation.z += delta * 25; // spin shuriken!
    }
  });

  if (thrownKind) {
    return (
      <group ref={group}>
        <PickableVisual kind={thrownKind} />
      </group>
    );
  }
  if (!descriptor) return null;
  // Size the VFX to the projectile's collision radius, so the animation reads as
  // the actual hit area (never larger than where it can connect).
  const tag = projectile?.ability;
  const abilityKind = tag === 'shuriken' ? 'ninja_w' : tag;
  const radius = abilityKind && isAbilityKind(abilityKind) ? ABILITIES[abilityKind].projectileRadius : undefined;
  // Use a custom GLSL projectile shader when one is registered for this VFX;
  // otherwise fall back to the descriptor's placeholder primitives.
  const Shader = vfxId ? PROJECTILE_SHADERS[vfxId] : undefined;
  return (
    <group ref={group}>
      {Shader ? (
        <Shader radius={radius} tint={tint} />
      ) : (
        <group scale={radius ? radius / 0.8 : 1}>
          <AssetMesh source={descriptor.render} />
        </group>
      )}
    </group>
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
