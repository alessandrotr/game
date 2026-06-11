import { useEffect, useMemo } from 'react';
import { useEnvStore, type EnvConfig } from '../tuning/useEnvStore';
import { useLevaSection } from './levaControls';

/**
 * Leva folders for live-tuning the per-world environment (lighting, shadows,
 * fog, tone). Write-only like the other panels: seeded once from the store, and
 * every edit is pushed back to `useEnvStore`, which the scene reads. One folder
 * per world so you can tune Town and Arena independently.
 */
function buildSchema(cfg: EnvConfig): Record<string, unknown> {
  return {
    background: { value: cfg.background, label: 'Background' },
    fogColor: { value: cfg.fogColor, label: 'Fog color' },
    fogNear: { value: cfg.fogNear, min: 0, max: 200, step: 1, label: 'Fog near' },
    fogFar: { value: cfg.fogFar, min: 0, max: 400, step: 1, label: 'Fog far' },
    ambient: { value: cfg.ambient, min: 0, max: 2, step: 0.01, label: 'Ambient' },
    hemiSky: { value: cfg.hemiSky, label: 'Hemi sky' },
    hemiGround: { value: cfg.hemiGround, label: 'Hemi ground' },
    hemiIntensity: { value: cfg.hemiIntensity, min: 0, max: 2, step: 0.01, label: 'Hemi intensity' },
    sunPosition: { value: cfg.sunPosition, step: 1, label: 'Sun position' },
    sunIntensity: { value: cfg.sunIntensity, min: 0, max: 4, step: 0.01, label: 'Sun intensity' },
    sunColor: { value: cfg.sunColor, label: 'Sun color' },
    fillPosition: { value: cfg.fillPosition, step: 1, label: 'Fill position' },
    fillIntensity: { value: cfg.fillIntensity, min: 0, max: 2, step: 0.01, label: 'Fill intensity' },
    fillColor: { value: cfg.fillColor, label: 'Fill color' },
    rimPosition: { value: cfg.rimPosition, step: 1, label: 'Rim position' },
    rimIntensity: { value: cfg.rimIntensity, min: 0, max: 2, step: 0.01, label: 'Rim intensity' },
    rimColor: { value: cfg.rimColor, label: 'Rim color' },
    shadowMapSize: { value: cfg.shadowMapSize, options: [1024, 2048, 4096], label: 'Shadow map' },
    shadowBias: { value: cfg.shadowBias, min: -0.005, max: 0.005, step: 0.0001, label: 'Shadow bias' },
    shadowNormalBias: {
      value: cfg.shadowNormalBias,
      min: 0,
      max: 0.2,
      step: 0.005,
      label: 'Shadow normal bias',
    },
    shadowExtent: { value: cfg.shadowExtent, min: 5, max: 60, step: 1, label: 'Shadow extent' },
    exposure: { value: cfg.exposure, min: 0.1, max: 3, step: 0.01, label: 'Exposure' },
  };
}

function EnvFolder({ room, label }: { room: 'town' | 'arena'; label: string }) {
  const initial = useMemo(() => useEnvStore.getState()[room], [room]);
  const [edited] = useLevaSection(`Environment · ${label}`, () => buildSchema(initial), {
    collapsed: true,
  });

  useEffect(() => {
    useEnvStore.getState().set(room, edited as unknown as Partial<EnvConfig>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edited]);

  return null;
}

export function EnvPanels() {
  return (
    <>
      <EnvFolder room="town" label="Town" />
      <EnvFolder room="arena" label="Arena" />
    </>
  );
}
