import { useMemo } from 'react';
import type { Vec3 } from '@arena/shared';
import { assets } from '../assets/registry';

/** Warm lantern glow. Height matches the lamp prop's lantern (~2.55u). */
const LAMP_COLOR = '#ffcf87';
const LAMP_HEIGHT = 2.55;

/**
 * Real lights for the town's lamps (and the arena gate). The lamp/arch props
 * only carry emissive *material* (which looks lit but illuminates nothing); this
 * adds an actual warm point light at each lantern so they cast pools of light on
 * the ground and nearby walls.
 *
 * Performance: these are **shadowless** point lights with a bounded `distance`,
 * so they're cheap — point-light shadows (6 cube maps each) are the expensive
 * part and we deliberately skip them.
 */
export function TownLights() {
  const lamps = useMemo<Vec3[]>(() => {
    const map = assets.getMap('map.town');
    return (map?.props ?? [])
      .filter((p) => p.assetId === 'prop.lamp')
      .map((p) => p.position);
  }, []);

  return (
    <group>
      {lamps.map((pos, i) => (
        <pointLight
          key={i}
          position={[pos[0], LAMP_HEIGHT, pos[2]]}
          color={LAMP_COLOR}
          intensity={9}
          distance={11}
          decay={2}
        />
      ))}
      {/* Forge glow at the blacksmith. */}
      <pointLight position={[12, 3.6, 4.4]} color="#ff7a3a" intensity={10} distance={8} decay={2} />
      {/* Braziers flanking the castle gatehouse, so the keep reads at dusk. */}
      <pointLight position={[2.6, 3, -22]} color={LAMP_COLOR} intensity={14} distance={13} decay={2} />
      <pointLight position={[-2.6, 3, -22]} color={LAMP_COLOR} intensity={14} distance={13} decay={2} />
    </group>
  );
}
