import { useEffect, useMemo } from 'react';
import type { FieldMeta } from '@arena/shared';
import { useLevaSection } from './levaControls';

/**
 * A Leva folder generated from a `*_FIELD_META` map. Controls (range/step/label)
 * come straight from the shared metadata, so adding a tunable field anywhere
 * makes a slider appear with no panel code. Fields whose meta `display` is
 * `'seconds'` are shown/edited in seconds while values stay in milliseconds.
 *
 * The schema is seeded ONCE from a snapshot (`getInitial`) so the panel is a
 * pure writer — it never reads the store back into its controls, which would
 * fight live edits. Edits are pushed to `onChange` in canonical units.
 */
export function MetaPanel({
  folder,
  meta,
  getInitial,
  onChange,
  collapsed = true,
}: {
  folder: string;
  meta: Partial<Record<string, FieldMeta>>;
  getInitial: () => Record<string, number>;
  onChange: (patch: Record<string, number>) => void;
  collapsed?: boolean;
}) {
  const initial = useMemo(getInitial, []); // snapshot at mount; panel is write-only

  const [edited] = useLevaSection(
    folder,
    () => {
      const schema: Record<string, unknown> = {};
      for (const [key, m] of Object.entries(meta)) {
        if (!m || typeof initial[key] !== 'number') continue;
        const scale = m.display === 'seconds' ? 1000 : 1;
        schema[key] = {
          value: initial[key] / scale,
          min: m.min / scale,
          max: m.max / scale,
          step: m.step / scale,
          label: m.display === 'seconds' ? `${m.label} (s)` : m.label,
        };
      }
      return schema;
    },
    { collapsed },
  );

  useEffect(() => {
    const patch: Record<string, number> = {};
    for (const [key, m] of Object.entries(meta)) {
      if (!m || typeof edited[key] !== 'number') continue;
      patch[key] = m.display === 'seconds' ? edited[key] * 1000 : edited[key];
    }
    onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edited]);

  return null;
}
