import type { FC } from 'react';
import type { VfxAssetId } from '@arena/shared';
import { FireballEffect } from '../../scene/FireballEffect';
import {
  ArcaneBoltEffect,
  CripplingShotEffect,
  HolyBoltEffect,
  PinningArrowEffect,
  PowerShotEffect,
} from './projectiles';
import {
  ArcaneBlastEffect,
  CastRuneEffect,
  CleaveEffect,
  CondemnEffect,
  DashEffect,
  FrostNovaEffect,
  GroundSlamEffect,
  HealEffect,
  SmashEffect,
} from './bursts';
import type { BurstShaderProps } from './common';

export type { BurstShaderProps } from './common';
export { ShieldBubble } from './ShieldBubble';

/**
 * The shader registries — the single place that maps a VFX id to a custom GLSL
 * effect. Add an effect by writing its shader component and adding one line
 * here; the render seams (`Projectiles`, `VfxLayer`) look it up and fall back to
 * the descriptor's placeholder primitives when no shader is registered.
 *
 * Projectile shaders loop (server drives their lifetime); burst shaders are
 * one-shot and self-unmount via {@link BurstShaderProps}.
 */
export const PROJECTILE_SHADERS: Partial<Record<VfxAssetId, FC>> = {
  'vfx.fireball': FireballEffect,
  'vfx.arcane_bolt': ArcaneBoltEffect,
  'vfx.power_shot': PowerShotEffect,
  'vfx.crippling_shot': CripplingShotEffect,
  'vfx.pinning_arrow': PinningArrowEffect,
  'vfx.holy_bolt': HolyBoltEffect,
};

export const BURST_SHADERS: Partial<Record<VfxAssetId, FC<BurstShaderProps>>> = {
  'vfx.frost': FrostNovaEffect,
  'vfx.arcane_blast': ArcaneBlastEffect,
  'vfx.ground_slam': GroundSlamEffect,
  'vfx.cleave': CleaveEffect,
  'vfx.smash': SmashEffect,
  'vfx.cast': CastRuneEffect,
  'vfx.heal': HealEffect,
  'vfx.condemn': CondemnEffect,
  'vfx.dash': DashEffect,
};
