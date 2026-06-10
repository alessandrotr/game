import { Suspense, lazy } from 'react';

/**
 * Production-safe entry for the developer tools.
 *
 * `import.meta.env.DEV` is a static boolean at build time, so in a production
 * build this branch resolves to `null`, the `import('./DevTools')` call is never
 * referenced, and the bundler tree-shakes DevTools — and therefore Leva — out
 * entirely. Zero production impact.
 */
const DevTools = import.meta.env.DEV ? lazy(() => import('./DevTools')) : null;

export function DevToolsGate() {
  if (!DevTools) return null;
  return (
    <Suspense fallback={null}>
      <DevTools />
    </Suspense>
  );
}
