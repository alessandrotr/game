import { Suspense, lazy } from 'react';

/**
 * Entry for the developer tools.
 *
 * Dev-only: `import.meta.env.DEV` statically resolves to `null` in production
 * builds, so DevTools (and Leva) tree-shake out entirely — zero runtime cost in
 * the shipped/playtest build. Run `pnpm dev` to get the live-tuning panel.
 */
const SHOW_DEVTOOLS = import.meta.env.DEV;
const DevTools = SHOW_DEVTOOLS ? lazy(() => import('./DevTools')) : null;

export function DevToolsGate() {
  if (!DevTools) return null;
  return (
    <Suspense fallback={null}>
      <DevTools />
    </Suspense>
  );
}
