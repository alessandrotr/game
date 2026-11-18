import { useMemo } from 'react';
import { useQualityStore, type QualityTier } from '../store/useQualityStore';
import { useEnvStore } from '../tuning/useEnvStore';
import { LOBBY_LIGHTS, type LobbyLight } from './lobbyLayout';

/**
 * Real point lights for the lobby's lit features (fountain crystal, braziers, forge,
 * tavern lanterns, door lamps). The model's lamps / windows only carry emissive
 * *material* — it looks lit but illuminates nothing — so these add the actual pools
 * of warm light on the ground and walls.
 *
 * The forward renderer pays for every point light on every lit fragment, so the set
 * is capped per quality tier and ordered by how much each light sells the scene:
 * hero lights first (fountain, castle gate, tavern, forge), accents last.
 *
 * Performance: all are **shadowless** with a bounded `distance` — point-light shadows
 * (6 cube maps each) are the expensive part and are deliberately skipped.
 */
const PRIORITY = [
  'fountain',
  'castle_brazier',
  'tavern_front',
  'forge',
  'keep_door',
  'chapel_door',
  'guildhall_door',
  'PortalGate_Arena_brazier',
  'PortalGate_Zombie_brazier',
  'tavern_door',
];

const MAX_LIGHTS: Record<QualityTier, number> = { low: 5, medium: 9, high: 13 };

export function TownLights() {
  const tier = useQualityStore((s) => s.tier);
  const gain = useEnvStore((s) => s.town.lightGain);
  const lights = useMemo<LobbyLight[]>(() => {
    const ordered: LobbyLight[] = [];
    for (const name of PRIORITY) ordered.push(...LOBBY_LIGHTS.filter((l) => l.name === name));
    // everything else (house door lanterns, ...) fills any remaining budget
    for (const l of LOBBY_LIGHTS) if (!ordered.includes(l)) ordered.push(l);
    return ordered.slice(0, MAX_LIGHTS[tier]);
  }, [tier]);

  return (
    <group>
      {lights.map((l, i) => (
        <pointLight
          key={`${l.name}:${i}`}
          position={l.pos}
          color={l.color}
          intensity={l.intensity * gain}
          distance={l.distance}
          decay={2}
        />
      ))}
    </group>
  );
}
