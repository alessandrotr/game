import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PhysicsControllerDemo } from './controller/PhysicsControllerDemo';
import { PoweredCharacterDemo } from './controller/PoweredCharacterDemo';
import { registerBuiltInAssets } from './assets/data';
import './index.css';

// Populate the asset registry before anything renders.
registerBuiltInAssets();

// Which screen to show. Flip this to switch entry points:
//   'game'    → <App /> (the networked multiplayer arena)
//   'physics' → <PhysicsControllerDemo /> (bare physics controller)
//   'powered' → <PoweredCharacterDemo /> (class characters + physics + powers)
const ENTRY: 'game' | 'physics' | 'powered' = 'game';

const SCREENS = {
  game: <App />,
  physics: <PhysicsControllerDemo />,
  powered: <PoweredCharacterDemo />,
};

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(<StrictMode>{SCREENS[ENTRY]}</StrictMode>);
