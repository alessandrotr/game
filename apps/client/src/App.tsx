import { useGameStore } from './store/useGameStore';
import { useAbilityHotkeys } from './hooks/useAbilityHotkeys';
import { useServerMovementTuning } from './hooks/useServerMovementTuning';
import { useServerAbilityTuning } from './hooks/useServerAbilityTuning';
import { GameScene } from './scene/GameScene';
import { JoinScreen } from './ui/JoinScreen';
import { Hud } from './ui/Hud';
import { DevToolsGate } from './devtools';

export default function App() {
  const status = useGameStore((s) => s.status);
  const connected = status === 'connected';

  useAbilityHotkeys(connected);
  useServerMovementTuning(connected);
  useServerAbilityTuning(connected);

  return (
    <>
      {/* Dev-only tuning panels (tree-shaken from production builds). */}
      <DevToolsGate />

      {connected ? (
        <>
          <GameScene />
          <Hud />
        </>
      ) : (
        <JoinScreen />
      )}
    </>
  );
}
