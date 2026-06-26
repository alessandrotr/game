import type { VfxDescriptor } from '@arena/shared';

/** Ability effects built from emissive primitives. Behavior drives animation. */

const fireball: VfxDescriptor = {
  id: 'vfx.fireball',
  displayName: 'Fireball',
  behavior: 'projectile',
  speed: 18,
  durationMs: 2000,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'core',
        shape: 'sphere',
        args: [0.18, 16, 16],
        color: '#fff1c2',
        emissive: '#ffd24a',
        emissiveIntensity: 3,
      },
      {
        name: 'flame',
        shape: 'sphere',
        args: [0.32, 16, 16],
        color: '#ff7b2e',
        emissive: '#ff5500',
        emissiveIntensity: 2.2,
        opacity: 0.6,
      },
    ],
  },
};

const arrow: VfxDescriptor = {
  id: 'vfx.arrow',
  displayName: 'Arrow',
  behavior: 'projectile',
  speed: 32,
  durationMs: 1500,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'shaft',
        shape: 'cylinder',
        args: [0.02, 0.02, 0.7, 6],
        rotation: [Math.PI / 2, 0, 0],
        color: '#cdbb99',
      },
      {
        name: 'tip',
        shape: 'cone',
        args: [0.05, 0.14, 8],
        position: [0, 0, 0.42],
        rotation: [Math.PI / 2, 0, 0],
        color: '#8a8f9c',
        metalness: 0.6,
      },
    ],
  },
};

const heal: VfxDescriptor = {
  id: 'vfx.heal',
  displayName: 'Heal',
  behavior: 'burst',
  durationMs: 900,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'ring',
        shape: 'torus',
        args: [0.6, 0.06, 12, 32],
        rotation: [Math.PI / 2, 0, 0],
        color: '#7cff9e',
        emissive: '#39ff88',
        emissiveIntensity: 2.2,
      },
    ],
  },
};

const cast: VfxDescriptor = {
  id: 'vfx.cast',
  displayName: 'Cast Flash',
  behavior: 'burst',
  durationMs: 450,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'flash',
        shape: 'sphere',
        args: [0.25, 12, 12],
        color: '#cfe6ff',
        emissive: '#8ec5ff',
        emissiveIntensity: 2.5,
        opacity: 0.8,
      },
    ],
  },
};

const portal: VfxDescriptor = {
  id: 'vfx.portal',
  displayName: 'Arena Portal',
  behavior: 'static',
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'ring',
        shape: 'torus',
        args: [1.1, 0.18, 16, 40],
        position: [0, 1.3, 0],
        color: '#1c9bd6',
        emissive: '#22c8ff',
        emissiveIntensity: 1.8,
      },
      {
        name: 'surface',
        shape: 'sphere',
        args: [0.95, 24, 24],
        position: [0, 1.3, 0],
        scale: [1, 1, 0.12],
        color: '#0a3a55',
        emissive: '#1880c0',
        emissiveIntensity: 1.2,
        opacity: 0.75,
      },
    ],
  },
};

const frost: VfxDescriptor = {
  id: 'vfx.frost',
  displayName: 'Frost Nova',
  behavior: 'burst',
  durationMs: 600,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'ring',
        shape: 'torus',
        args: [1.0, 0.12, 12, 36],
        rotation: [Math.PI / 2, 0, 0],
        color: '#bfefff',
        emissive: '#5fd8ff',
        emissiveIntensity: 2.4,
        opacity: 0.85,
      },
      {
        name: 'burst',
        shape: 'sphere',
        args: [0.6, 16, 16],
        color: '#dff6ff',
        emissive: '#7fe3ff',
        emissiveIntensity: 1.8,
        opacity: 0.5,
      },
    ],
  },
};

/** Arcane Bolt: a fast violet projectile (the mage's long-range bolt). */
const arcaneBolt: VfxDescriptor = {
  id: 'vfx.arcane_bolt',
  displayName: 'Arcane Bolt',
  behavior: 'projectile',
  speed: 26,
  durationMs: 2000,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'core',
        shape: 'sphere',
        args: [0.16, 16, 16],
        color: '#efe3ff',
        emissive: '#b07bff',
        emissiveIntensity: 3,
      },
      {
        name: 'aura',
        shape: 'sphere',
        args: [0.28, 16, 16],
        color: '#c79bff',
        emissive: '#7a2bff',
        emissiveIntensity: 2,
        opacity: 0.55,
      },
    ],
  },
};

/** Shockwave: an orange ground ring bursting out from the caster. */
const shockwave: VfxDescriptor = {
  id: 'vfx.shockwave',
  displayName: 'Shockwave',
  behavior: 'burst',
  durationMs: 550,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'ring',
        shape: 'torus',
        args: [1.2, 0.16, 12, 36],
        rotation: [Math.PI / 2, 0, 0],
        color: '#ffd9a0',
        emissive: '#ff7a1a',
        emissiveIntensity: 2.6,
      },
      {
        name: 'core',
        shape: 'sphere',
        args: [0.55, 16, 16],
        color: '#ffe6b0',
        emissive: '#ff9d3a',
        emissiveIntensity: 1.8,
        opacity: 0.5,
      },
    ],
  },
};

/** Arcane Blast: a violet explosion at the strike point. */
const arcaneBlast: VfxDescriptor = {
  id: 'vfx.arcane_blast',
  displayName: 'Arcane Blast',
  behavior: 'burst',
  durationMs: 650,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'blast',
        shape: 'sphere',
        args: [0.95, 18, 18],
        color: '#e9d2ff',
        emissive: '#9b4dff',
        emissiveIntensity: 3,
        opacity: 0.7,
      },
      {
        name: 'shock',
        shape: 'torus',
        args: [1.5, 0.16, 12, 36],
        rotation: [Math.PI / 2, 0, 0],
        color: '#c79bff',
        emissive: '#7a2bff',
        emissiveIntensity: 2.2,
      },
    ],
  },
};

// --- New ability VFX (custom GLSL shaders; placeholder render is the fallback
//     used only if a shader is ever missing for the id). ----------------------

/** A glowing energy dart (archer power shot). Shader: PROJECTILE_SHADERS. */
const powerShot: VfxDescriptor = {
  id: 'vfx.power_shot',
  displayName: 'Power Shot',
  behavior: 'projectile',
  speed: 30,
  durationMs: 1500,
  render: {
    kind: 'placeholder',
    parts: [{ name: 'core', shape: 'sphere', args: [0.16, 12, 12], color: '#d6ffe0', emissive: '#7dff9c', emissiveIntensity: 3 }],
  },
};

/** A frigid blue dart (archer crippling shot). */
const cripplingShot: VfxDescriptor = {
  id: 'vfx.crippling_shot',
  displayName: 'Crippling Shot',
  behavior: 'projectile',
  speed: 28,
  durationMs: 1500,
  render: {
    kind: 'placeholder',
    parts: [{ name: 'core', shape: 'sphere', args: [0.16, 12, 12], color: '#d6f2ff', emissive: '#5fc8ff', emissiveIntensity: 3 }],
  },
};

/** A rain of arrows falling onto the target area (archer concussive volley).
 *  The custom burst shader owns the visual; this just supplies the lifetime. */
const arrowVolley: VfxDescriptor = {
  id: 'vfx.arrow_volley',
  displayName: 'Arrow Volley',
  behavior: 'burst',
  durationMs: 1450,
  render: {
    kind: 'placeholder',
    parts: [{ name: 'core', shape: 'sphere', args: [0.05, 6, 6], color: '#dfe7f0' }],
  },
};

/** A heavy crimson-gold bolt (archer pinning arrow). */
const pinningArrow: VfxDescriptor = {
  id: 'vfx.pinning_arrow',
  displayName: 'Pinning Arrow',
  behavior: 'projectile',
  speed: 34,
  durationMs: 1500,
  render: {
    kind: 'placeholder',
    parts: [{ name: 'core', shape: 'sphere', args: [0.18, 12, 12], color: '#ffe6c2', emissive: '#ffb24a', emissiveIntensity: 3 }],
  },
};

/** A radiant golden orb (priest smite). */
const holyBolt: VfxDescriptor = {
  id: 'vfx.holy_bolt',
  displayName: 'Holy Bolt',
  behavior: 'projectile',
  speed: 26,
  durationMs: 1600,
  render: {
    kind: 'placeholder',
    parts: [{ name: 'core', shape: 'sphere', args: [0.18, 12, 12], color: '#fff3d0', emissive: '#ffcf57', emissiveIntensity: 3 }],
  },
};

/** Warrior cleave — a steel blade-trail sweeping a full circle. Shader: BURST_SHADERS. */
const cleave: VfxDescriptor = {
  id: 'vfx.cleave',
  displayName: 'Cleave',
  behavior: 'burst',
  // Double speed — plays in half its old 560ms so the swing snaps.
  durationMs: 280,
  render: { kind: 'placeholder', parts: [{ name: 'arc', shape: 'torus', args: [2.8, 0.18, 10, 40], rotation: [Math.PI / 2, 0, 0], color: '#ffe2b0', emissive: '#ff7a1a', emissiveIntensity: 3.2 }] },
};

/** Warrior ground slam — a heavy dust shockwave. */
const groundSlam: VfxDescriptor = {
  id: 'vfx.ground_slam',
  displayName: 'Ground Slam',
  behavior: 'burst',
  // ~50% faster than its old 720ms so the shockwave snaps out.
  durationMs: 480,
  render: { kind: 'placeholder', parts: [{ name: 'ring', shape: 'torus', args: [1.4, 0.18, 12, 36], rotation: [Math.PI / 2, 0, 0], color: '#ffc184', emissive: '#ff6a1a', emissiveIntensity: 2.6 }] },
};

/** Warrior smash — a Syndra-style dark-sphere energy burst cast in front of the
 *  swing. Rendered by a custom shader (BURST_SHADERS['vfx.smash']); the
 *  placeholder parts are only a fallback if that shader is ever unregistered. */
const smash: VfxDescriptor = {
  id: 'vfx.smash',
  displayName: 'Smash',
  behavior: 'burst',
  durationMs: 520,
  render: {
    kind: 'placeholder',
    parts: [
      { name: 'orb', shape: 'sphere', args: [0.5, 16, 14], position: [0, 0.9, 0], color: '#2a0a4d', emissive: '#7a3cff', emissiveIntensity: 3, opacity: 0.9 },
    ],
  },
};

/** A directional dash streak (warrior charge / archer tumble). */
const dash: VfxDescriptor = {
  id: 'vfx.dash',
  displayName: 'Dash',
  behavior: 'burst',
  durationMs: 380,
  render: { kind: 'placeholder', parts: [{ name: 'streak', shape: 'box', args: [1.6, 0.1, 0.4], color: '#cfe6ff', emissive: '#9ec5ff', emissiveIntensity: 2, opacity: 0.7 }] },
};


/** Priest condemn — a column of holy light slamming onto the target. */
const condemn: VfxDescriptor = {
  id: 'vfx.condemn',
  displayName: 'Condemn',
  behavior: 'burst',
  durationMs: 700,
  render: { kind: 'placeholder', parts: [{ name: 'beam', shape: 'cylinder', args: [0.3, 0.3, 3, 12], position: [0, 1.5, 0], color: '#fff0c2', emissive: '#ffcf57', emissiveIntensity: 2.6, opacity: 0.7 }] },
};

/** Death burst — a crimson soul-blast when a player is killed. A dark cloud, a
 *  bright red flash, and a ground shockwave ring expand out from the body. */
const death: VfxDescriptor = {
  id: 'vfx.death',
  displayName: 'Death',
  behavior: 'burst',
  durationMs: 900,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'cloud',
        shape: 'sphere',
        args: [0.75, 16, 16],
        color: '#2a0810',
        emissive: '#6a0c1a',
        emissiveIntensity: 1.5,
        opacity: 0.7,
      },
      {
        name: 'flash',
        shape: 'sphere',
        args: [0.4, 16, 16],
        color: '#ff6a6a',
        emissive: '#ff2424',
        emissiveIntensity: 3.2,
        opacity: 0.85,
      },
      {
        name: 'shockwave',
        shape: 'torus',
        args: [0.95, 0.12, 12, 36],
        rotation: [Math.PI / 2, 0, 0],
        color: '#ff9a9a',
        emissive: '#ff3030',
        emissiveIntensity: 2.6,
      },
    ],
  },
};

/** Car detonation — a fireball + ground shock when a car's HP hits zero.
 *  Rendered by a custom shader (BURST_SHADERS['vfx.car_explosion']); the
 *  placeholder parts are only a fallback if that shader is ever unregistered. */
const carExplosion: VfxDescriptor = {
  id: 'vfx.car_explosion',
  displayName: 'Car Explosion',
  behavior: 'burst',
  durationMs: 850,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'fireball',
        shape: 'sphere',
        args: [1.4, 18, 18],
        position: [0, 1.2, 0],
        color: '#ffd27a',
        emissive: '#ff5a1a',
        emissiveIntensity: 3.2,
        opacity: 0.85,
      },
      {
        name: 'shock',
        shape: 'torus',
        args: [2.0, 0.2, 12, 40],
        rotation: [Math.PI / 2, 0, 0],
        color: '#ffb072',
        emissive: '#ff6a1a',
        emissiveIntensity: 2.4,
      },
    ],
  },
};

/** Barrel detonation — the car explosion shader, scaled down. Rendered by a
 *  custom shader (BURST_SHADERS['vfx.barrel_explosion']); the placeholder parts
 *  are only a fallback if that shader is ever unregistered. */
const barrelExplosion: VfxDescriptor = {
  id: 'vfx.barrel_explosion',
  displayName: 'Barrel Explosion',
  behavior: 'burst',
  durationMs: 700,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'fireball',
        shape: 'sphere',
        args: [0.9, 16, 16],
        position: [0, 0.8, 0],
        color: '#ffd27a',
        emissive: '#ff5a1a',
        emissiveIntensity: 3.2,
        opacity: 0.85,
      },
      {
        name: 'shock',
        shape: 'torus',
        args: [1.3, 0.16, 12, 36],
        rotation: [Math.PI / 2, 0, 0],
        color: '#ffb072',
        emissive: '#ff6a1a',
        emissiveIntensity: 2.4,
      },
    ],
  },
};

/** Zombie blood splash: a procedural red spray. Shader: BURST_SHADERS. */
const bloodSplash: VfxDescriptor = {
  id: 'vfx.blood_splash',
  displayName: 'Blood Splash',
  behavior: 'burst',
  durationMs: 800,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'splash',
        shape: 'sphere',
        args: [1, 15, 15],
        color: '#8b0000',
        emissive: '#8b0000',
        emissiveIntensity: 2,
      },
    ],
  },
};

const lightningSpark: VfxDescriptor = {
  id: 'vfx.lightning_spark',
  displayName: 'Lightning Spark',
  behavior: 'burst',
  durationMs: 1000,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'spark',
        shape: 'sphere',
        args: [0.8, 12, 12],
        color: '#8ec5ff',
        emissive: '#0080ff',
        emissiveIntensity: 3,
      },
    ],
  },
};

const chestSpawn: VfxDescriptor = {
  id: 'vfx.chest_spawn',
  displayName: 'Chest Spawn',
  behavior: 'burst',
  durationMs: 800,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'flash',
        shape: 'sphere',
        args: [0.5, 12, 12],
        color: '#ffdf7a',
        emissive: '#ffa81a',
        emissiveIntensity: 2.5,
        opacity: 0.8,
      },
    ],
  },
};

/** Heal-trap beacon — a curtain of light rising to the sky around the trap
 *  radius. Rendered by a custom shader (BURST_SHADERS['vfx.heal_beam']); the
 *  placeholder part is a fallback only. */
const healBeam: VfxDescriptor = {
  id: 'vfx.heal_beam',
  displayName: 'Heal Beacon',
  behavior: 'burst',
  durationMs: 1500,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'beam',
        shape: 'cylinder',
        args: [1, 1, 2, 24],
        position: [0, 1, 0],
        color: '#7cffc4',
        emissive: '#39ffb0',
        emissiveIntensity: 2.4,
        opacity: 0.5,
      },
    ],
  },
};

/** Singularity trap detonation — the black hole's final purple/cyan blast.
 *  Rendered by a custom shader (BURST_SHADERS['vfx.singularity_blast']). */
const singularityBlast: VfxDescriptor = {
  id: 'vfx.singularity_blast',
  displayName: 'Singularity Blast',
  behavior: 'burst',
  durationMs: 700,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'flash',
        shape: 'sphere',
        args: [0.6, 14, 14],
        color: '#d6a0ff',
        emissive: '#a855f7',
        emissiveIntensity: 3,
        opacity: 0.8,
      },
    ],
  },
};

const shuriken: VfxDescriptor = {
  id: 'vfx.shuriken',
  displayName: 'Shuriken',
  behavior: 'projectile',
  speed: 55,
  durationMs: 1000,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'core',
        shape: 'cylinder',
        args: [0.35, 0.35, 0.04, 8],
        rotation: [Math.PI / 2, 0, 0],
        color: '#151515',
        metalness: 0.9,
        roughness: 0.3,
      },
      {
        name: 'blade1',
        shape: 'cone',
        args: [0.1, 0.5, 4],
        position: [0, 0.55, 0],
        color: '#2a2d33',
        metalness: 0.85,
        roughness: 0.26,
      },
      {
        name: 'blade2',
        shape: 'cone',
        args: [0.1, 0.5, 4],
        position: [0, -0.55, 0],
        rotation: [0, 0, Math.PI],
        color: '#2a2d33',
        metalness: 0.85,
        roughness: 0.26,
      },
      {
        name: 'blade3',
        shape: 'cone',
        args: [0.1, 0.5, 4],
        position: [0.55, 0, 0],
        rotation: [0, 0, -Math.PI / 2],
        color: '#2a2d33',
        metalness: 0.85,
        roughness: 0.26,
      },
      {
        name: 'blade4',
        shape: 'cone',
        args: [0.1, 0.5, 4],
        position: [-0.55, 0, 0],
        rotation: [0, 0, Math.PI / 2],
        color: '#2a2d33',
        metalness: 0.85,
        roughness: 0.26,
      },
    ],
  },
};

const smokeTeleport: VfxDescriptor = {
  id: 'vfx.smoke_teleport',
  displayName: 'Smoke Teleport',
  behavior: 'burst',
  durationMs: 600,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'cloud',
        shape: 'sphere',
        args: [1.1, 16, 16],
        position: [0, 0.6, 0],
        color: '#1a1a1c',
        roughness: 0.9,
        opacity: 0.85,
      },
      {
        name: 'puff',
        shape: 'sphere',
        args: [1.4, 12, 12],
        position: [0, 0.4, 0],
        color: '#111111',
        roughness: 0.9,
        opacity: 0.6,
      },
      {
        name: 'ring',
        shape: 'torus',
        args: [0.9, 0.09, 8, 24],
        rotation: [Math.PI / 2, 0, 0],
        color: '#252528',
        opacity: 0.7,
      },
    ],
  },
};

const ninjaSlash1: VfxDescriptor = {
  id: 'vfx.ninja_slash_1',
  displayName: 'Ninja Slash 1',
  behavior: 'burst',
  durationMs: 250,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'arc.outer',
        shape: 'torus',
        args: [4.0, 0.14, 10, 40, (120 * Math.PI) / 180],
        rotation: [Math.PI / 2, 0, Math.PI / 6],
        color: '#151518',
        emissive: '#4a0e7a',
        emissiveIntensity: 3.0,
      },
      {
        name: 'arc.inner',
        shape: 'torus',
        args: [3.5, 0.06, 10, 40, (120 * Math.PI) / 180],
        rotation: [Math.PI / 2, 0, Math.PI / 6],
        color: '#101012',
        emissive: '#9400d3',
        emissiveIntensity: 4.0,
        opacity: 0.8,
      },
    ],
  },
};

const ninjaSlash2: VfxDescriptor = {
  id: 'vfx.ninja_slash_2',
  displayName: 'Ninja Slash 2',
  behavior: 'burst',
  durationMs: 250,
  render: {
    kind: 'placeholder',
    parts: [
      {
        name: 'arc.outer',
        shape: 'torus',
        args: [4.5, 0.14, 10, 40, Math.PI],
        rotation: [Math.PI / 2, 0, 0],
        color: '#151518',
        emissive: '#4a0e7a',
        emissiveIntensity: 3.0,
      },
      {
        name: 'arc.inner',
        shape: 'torus',
        args: [4.0, 0.06, 10, 40, Math.PI],
        rotation: [Math.PI / 2, 0, 0],
        color: '#101012',
        emissive: '#9400d3',
        emissiveIntensity: 4.0,
        opacity: 0.8,
      },
    ],
  },
};

export const VFX: VfxDescriptor[] = [
  fireball,
  arrow,
  heal,
  healBeam,
  singularityBlast,
  cast,
  portal,
  frost,
  shockwave,
  arcaneBolt,
  arcaneBlast,
  powerShot,
  cripplingShot,
  arrowVolley,
  pinningArrow,
  holyBolt,
  cleave,
  smash,
  groundSlam,
  dash,
  condemn,
  death,
  carExplosion,
  barrelExplosion,
  bloodSplash,
  lightningSpark,
  chestSpawn,
  shuriken,
  smokeTeleport,
  ninjaSlash1,
  ninjaSlash2,
];

