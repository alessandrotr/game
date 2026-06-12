import { useEffect, useState } from 'react';
import { useGameStore } from './store/useGameStore';
import { useAuthStore } from './store/useAuthStore';
import { useMinimumDuration } from './hooks/useMinimumDuration';
import { useAbilityHotkeys } from './hooks/useAbilityHotkeys';
import { useJump } from './hooks/useJump';
import { useEmotes } from './hooks/useEmotes';
import { useServerMovementTuning } from './hooks/useServerMovementTuning';
import { useServerAbilityTuning } from './hooks/useServerAbilityTuning';
import { useServerStatTuning } from './hooks/useServerStatTuning';
import { useInteractionInput } from './hooks/useInteractionInput';
import { GameScene } from './scene/GameScene';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { disconnect } from './network/colyseus';
import { JoinScreen } from './ui/JoinScreen';
import { AuthScreen } from './ui/AuthScreen';
import { LandingPage } from './ui/LandingPage';
import { LoadingScreen } from './ui/LoadingScreen';
import { Hud } from './ui/Hud';
import { InteractionUI } from './ui/InteractionUI';
import { ChatPanel } from './ui/ChatPanel';
import { DevToolsGate } from './devtools';

export default function App() {
  const status = useGameStore((s) => s.status);
  const connected = status === 'connected';
  const inArena = useGameStore((s) => s.room) === 'arena';
  const transitioning = useGameStore((s) => s.transitioning);
  const transitionLabel = useGameStore((s) => s.transitionLabel);

  // Account gate: validate any saved session token once on boot.
  const authStatus = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);
  useEffect(() => {
    void restore();
  }, [restore]);

  // Pre-login flow: logged-out visitors see the marketing landing first, then
  // the auth form (← back returns here). Authed users skip both.
  const [view, setView] = useState<'landing' | 'auth'>('landing');
  const minLoading = useMinimumDuration(1200); // floor the intro splash
  useEffect(() => {
    // Sign-out (authed → idle) returns the user to the landing, not the form.
    if (authStatus === 'idle') setView('landing');
  }, [authStatus]);

  // Combat input + live tuning are arena-only (the town room has no such handlers,
  // and Colyseus disconnects a client that sends an unhandled message). Movement
  // and NPC interaction apply in both worlds.
  useAbilityHotkeys(connected && inArena);
  useJump(connected); // jump works in both town and arena
  useEmotes(connected); // number keys → dances, in both worlds
  useServerMovementTuning(connected && inArena);
  useServerAbilityTuning(connected && inArena);
  useServerStatTuning(connected && inArena);
  useInteractionInput(connected);

  // Branded intro: shown while restoring a saved session AND for a minimum
  // window, so it reads as a deliberate splash even when restore is instant
  // (and never flashes the login form for returning users).
  if (authStatus === 'restoring' || minLoading) {
    return <LoadingScreen />;
  }
  if (authStatus !== 'authed') {
    return view === 'landing' ? (
      <LandingPage onPlay={() => setView('auth')} />
    ) : (
      <AuthScreen onBack={() => setView('landing')} />
    );
  }

  return (
    <>
      {/* Dev-only tuning panels (tree-shaken from production builds). */}
      <DevToolsGate />

      {connected ? (
        <ErrorBoundary
          onError={() => {
            // A render crash tears down the session → App falls back to JoinScreen,
            // the same as a clean disconnect (rather than a white screen).
            disconnect();
            useGameStore.getState().reset();
          }}
        >
          <GameScene />
          <Hud />
          <InteractionUI />
          <ChatPanel />
        </ErrorBoundary>
      ) : (
        <JoinScreen />
      )}

      {/* Cover the town↔arena swap so the wait reads as a deliberate load. */}
      {transitioning && <LoadingScreen subtitle={transitionLabel} />}
    </>
  );
}
