import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import { registerBuiltInAssets } from './assets/data';
import { installGlobalErrorReporting } from './network/telemetry';
import './index.css';

// Crash reporting (Sentry). Production builds only — `import.meta.env.PROD` is
// false under the dev server, so local errors never hit Sentry (keeps dev noise
// out of the free-tier quota). DSN comes from VITE_SENTRY_DSN. Errors-only — no
// performance tracing or session replay. Init runs first so it can catch
// failures during the rest of bootstrap.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN && import.meta.env.PROD) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}

// Populate the asset registry before anything renders.
registerBuiltInAssets();
// Capture WebSocket close codes + other non-exception drops to the self-hosted
// /client-error sink (Sentry can't see a clean socket close — it isn't a JS
// error). JS exceptions are captured by Sentry above.
installGlobalErrorReporting();

// Which screen to show. Set VITE_ENTRY to switch entry points (defaults to the
// game). The two demos are dev-only physics sandboxes and are dynamically
// imported below, so they are split into a lazy chunk and never weigh down the
// production bundle that ships the game.
//   'game'    → <App /> (the networked multiplayer arena)
//   'physics' → bare physics controller demo
//   'powered' → class characters + physics + powers demo
const ENTRY = (import.meta.env.VITE_ENTRY as 'game' | 'physics' | 'powered') || 'game';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');
const root = createRoot(container);

const mount = (node: ReactNode) => root.render(<StrictMode>{node}</StrictMode>);

if (ENTRY === 'physics') {
  void import('./controller/PhysicsControllerDemo').then(({ PhysicsControllerDemo }) =>
    mount(<PhysicsControllerDemo />),
  );
} else if (ENTRY === 'powered') {
  void import('./controller/PoweredCharacterDemo').then(({ PoweredCharacterDemo }) =>
    mount(<PoweredCharacterDemo />),
  );
} else {
  mount(<App />);
}
