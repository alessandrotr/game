import { useEffect } from 'react';
import { useGameStore } from './store/useGameStore';
import { useAuthStore } from './store/useAuthStore';
import { useCameraPrefsStore } from './store/useCameraPrefsStore';
import { useCosmeticsStore } from './store/useCosmeticsStore';
import { useMinimumDuration } from './hooks/useMinimumDuration';
import { useAbilityHotkeys } from './hooks/useAbilityHotkeys';
import { useJump } from './hooks/useJump';
import { useInteract } from './hooks/useInteract';
import { useEmotes } from './hooks/useEmotes';
import { useServerMovementTuning } from './hooks/useServerMovementTuning';
import { useServerAbilityTuning } from './hooks/useServerAbilityTuning';
import { useServerStatTuning } from './hooks/useServerStatTuning';
import { useServerCombatFlags } from './hooks/useServerCombatFlags';
import { useInteractionInput } from './hooks/useInteractionInput';
import { useHudHotkey } from './hooks/useHudHotkey';
import { GameScene } from './scene/GameScene';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ConnectionLost } from './ui/ConnectionLost';
import { useConnectionStore } from './store/useConnectionStore';
import { useMatchResultStore } from './store/useMatchResultStore';
import { disconnect, timeSinceLastPatch } from './network/colyseus';
import { JoinScreen } from './ui/JoinScreen';

/** No state for this long (server ticks ~20/s) means the socket has gone quiet. */
const STALE_MS = 3000;
import { AuthScreen } from './ui/AuthScreen';
import { LoadingScreen } from './ui/LoadingScreen';
import { Hud } from './ui/Hud';
import { InteractionUI } from './ui/InteractionUI';
import { ChatPanel } from './ui/ChatPanel';
import { DevToolsGate } from './devtools';
import { MusicDirector, useAudioUnlock } from './audio';
import { TownBackdrop } from './scene/TownBackdrop';

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

  // Pull the account's saved camera-lock prefs + cosmetics once signed in.
  useEffect(() => {
    if (authStatus === 'authed') {
      void useCameraPrefsStore.getState().loadForAccount();
      void useCosmeticsStore.getState().loadForAccount();
    }
  }, [authStatus]);

  const minLoading = useMinimumDuration(1200); // floor the intro splash

  // Combat input + live tuning are arena-only (the town room has no such handlers,
  // and Colyseus disconnects a client that sends an unhandled message). Movement
  // and NPC interaction apply in both worlds.
  useAbilityHotkeys(connected && inArena);
  useJump(connected && !inArena); // jump in town; the arena uses spacebar to throw
  useInteract(connected && inArena); // spacebar grabs/throws pickables (arena only)
  useEmotes(connected); // number keys → dances, in both worlds
  useServerMovementTuning(connected && inArena);
  useServerAbilityTuning(connected && inArena);
  useServerStatTuning(connected && inArena);
  useServerCombatFlags(connected && inArena); // sync the auto-attack feature flag
  useInteractionInput(connected);
  useHudHotkey(connected); // H toggles HUD chrome visibility
  useAudioUnlock(); // resume the audio context on the first user gesture

  // Connection watchdog: while in-game (and not mid world-swap), if no state has
  // arrived for a while the socket has gone quiet — raise the "connection lost"
  // overlay. The state handler clears it again the moment patches resume.
  const connectionLost = useConnectionStore((s) => s.lost);
  const setConnectionLost = useConnectionStore((s) => s.setLost);
  useEffect(() => {
    if (!connected || transitioning) return;
    const id = window.setInterval(() => {
      // The server freezes the arena sim while the end-of-match results screen
      // shows (then disposes the room as a backstop). A quiet socket during that
      // window is expected — not a dropped connection — so don't false-alarm.
      if (useMatchResultStore.getState().result) return;
      if (timeSinceLastPatch() > STALE_MS) setConnectionLost(true);
    }, 1000);
    return () => window.clearInterval(id);
  }, [connected, transitioning, setConnectionLost]);

  // Branded intro: shown while restoring a saved session AND for a minimum
  // window, so it reads as a deliberate splash even when restore is instant
  // (and never flashes the login form for returning users).
  if (authStatus === 'restoring' || minLoading) {
    return <LoadingScreen />;
  }

  return (
    <>
      {/* Background music: the menu theme plays across the whole pre-game flow
          (auth + character select) and is silenced in-world (for now). Mounted
          once here at a stable position so it never restarts across the
          auth→join→world transitions. */}
      <MusicDirector />

      {/* The town backdrop behind the pre-game menus (auth + character select).
          Mounted once here at a stable position so signing in swaps only the
          overlay on top — the town scene is never torn down and reloaded. It
          unmounts when entering the world, where GameScene renders the live town. */}
      {!connected && <TownBackdrop />}

      {authStatus !== 'authed' ? (
        <AuthScreen />
      ) : (
        <>
          {/* Dev-only tuning panels (tree-shaken from production builds). */}
          <DevToolsGate />

          {connected ? (
            <ErrorBoundary
              onError={() => {
                // A render crash tears down the session → App falls back to
                // JoinScreen, the same as a clean disconnect (not a white screen).
                disconnect();
                useGameStore.getState().reset();
              }}
            >
              <GameScene />
              <Hud />
              <InteractionUI />
              <ChatPanel />
              {connectionLost && <ConnectionLost />}
            </ErrorBoundary>
          ) : (
            <JoinScreen />
          )}

          {/* Cover the town↔arena swap so the wait reads as a deliberate load. */}
          {transitioning && <LoadingScreen subtitle={transitionLabel} />}
        </>
      )}
    </>
  );
}
