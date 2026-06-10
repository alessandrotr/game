import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerBuiltInAssets } from './assets/data';
import './index.css';

// Populate the asset registry before anything renders.
registerBuiltInAssets();

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
