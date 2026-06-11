import { useEffect } from 'react';
import { useGameStore } from './store/useGameStore';
import { useAuthStore } from './store/useAuthStore';
import { useAbilityHotkeys } from './hooks/useAbilityHotkeys';
import { useJump } from './hooks/useJump';
import { useEmotes } from './hooks/useEmotes';
import { useServerMovementTuning } from './hooks/useServerMovementTuning';
import { useServerAbilityTuning } from './hooks/useServerAbilityTuning';
import { useInteractionInput } from './hooks/useInteractionInput';
import { GameScene } from './scene/GameScene';
import { JoinScreen } from './ui/JoinScreen';
import { AuthScreen } from './ui/AuthScreen';
import { Hud } from './ui/Hud';
import { InteractionUI } from './ui/InteractionUI';
import { ChatPanel } from './ui/ChatPanel';
import { DevToolsGate } from './devtools';

export default function App() {
  const status = useGameStore((s) => s.status);
  const connected = status === 'connected';
  const inArena = useGameStore((s) => s.room) === 'arena';

  // Account gate: validate any saved session token once on boot.
  const authStatus = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);
  useEffect(() => {
    void restore();
  }, [restore]);

  // Combat input + live tuning are arena-only (the town room has no such handlers,
  // and Colyseus disconnects a client that sends an unhandled message). Movement
  // and NPC interaction apply in both worlds.
  useAbilityHotkeys(connected && inArena);
  useJump(connected); // jump works in both town and arena
  useEmotes(connected); // number keys → dances, in both worlds
  useServerMovementTuning(connected && inArena);
  useServerAbilityTuning(connected && inArena);
  useInteractionInput(connected);

  // Sign-in gate sits in front of everything. While restoring a saved session,
  // show a minimal splash so we don't flash the login form for returning users.
  if (authStatus === 'restoring') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#07080d]">
        <span className="font-display text-2xl tracking-[0.35em] text-gold/70">ARENA</span>
      </div>
    );
  }
  if (authStatus !== 'authed') {
    return <AuthScreen />;
  }

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
