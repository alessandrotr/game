import { Suspense, lazy } from 'react';

/**
 * Entry for the developer tools.
 *
 * TEMP(playtest): dev tools are enabled in production too, so we can live-tune
 * during friend playtests on the deployed build. To restore zero production
 * impact, set this back to `import.meta.env.DEV` — that statically resolves to
 * `null` in prod and tree-shakes DevTools (and Leva) out entirely.
 */
const SHOW_DEVTOOLS = true; // was: import.meta.env.DEV
const DevTools = SHOW_DEVTOOLS ? lazy(() => import('./DevTools')) : null;

export function DevToolsGate() {
  if (!DevTools) return null;
  return (
    <Suspense fallback={null}>
      <DevTools />
    </Suspense>
  );
}
