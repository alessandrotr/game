import { useGameStore } from './store/useGameStore';
import { useAbilityHotkeys } from './hooks/useAbilityHotkeys';
import { useServerMovementTuning } from './hooks/useServerMovementTuning';
import { useServerAbilityTuning } from './hooks/useServerAbilityTuning';
import { useInteractionInput } from './hooks/useInteractionInput';
import { GameScene } from './scene/GameScene';
import { JoinScreen } from './ui/JoinScreen';
import { Hud } from './ui/Hud';
import { InteractionUI } from './ui/InteractionUI';
import { ChatPanel } from './ui/ChatPanel';
import { DevToolsGate } from './devtools';

export default function App() {
  const status = useGameStore((s) => s.status);
  const connected = status === 'connected';
  const inArena = useGameStore((s) => s.room) === 'arena';

  // Combat input + live tuning are arena-only (the town room has no such handlers,
  // and Colyseus disconnects a client that sends an unhandled message). Movement
  // and NPC interaction apply in both worlds.
  useAbilityHotkeys(connected && inArena);
  useServerMovementTuning(connected && inArena);
  useServerAbilityTuning(connected && inArena);
  useInteractionInput(connected);

  return (
    <>
      {/* Dev-only tuning panels (tree-shaken from production builds). */}
      <DevToolsGate />

      {connected ? (
        <>
          <GameScene />
          <Hud />
          <InteractionUI />
          <ChatPanel />
        </>
      ) : (
        <JoinScreen />
      )}
    </>
  );
}
