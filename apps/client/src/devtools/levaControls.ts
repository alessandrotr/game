import { useControls } from 'leva';

/**
 * Loosely-typed bridge to Leva's `useControls` factory form.
 *
 * We build Leva schemas dynamically from the tuning registry, which Leva's
 * heavily-generic `Schema` type can't infer. This wrapper pins the practical
 * shape we rely on — a folder name, a schema factory, settings — and returns the
 * `[values, set]` tuple, so the panels stay clean and fully typed downstream.
 */
export const useLevaSection = useControls as unknown as (
  folder: string,
  schemaFactory: () => Record<string, unknown>,
  settings?: Record<string, unknown>,
) => [Record<string, number>, (patch: Record<string, number>) => void];
