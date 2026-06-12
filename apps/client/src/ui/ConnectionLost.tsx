import { leaveToCharacterSelect } from '../network/colyseus';
import { Button } from './primitives';

/**
 * Overlay shown when the connection drops mid-session but the game is still
 * mounted (a silent socket stall or a room error). It dims the frozen scene,
 * explains what happened, and offers a clean exit — so the player isn't left
 * staring at a game that quietly stopped responding. If the connection recovers
 * (state resumes) the overlay clears itself; if it's truly gone, `onLeave`
 * eventually returns the player to the join screen anyway.
 */
export function ConnectionLost() {
  return (
    <div className="absolute inset-0 z-70 flex flex-col items-center justify-center gap-5 bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-panel/90 px-8 py-6 text-center shadow-xl">
        {/* Pulsing dot — reads as "trying", not a hard failure. */}
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
        </span>
        <h2 className="text-lg font-bold text-white">Connection lost</h2>
        <p className="max-w-xs text-sm text-muted">
          Trying to reach the server… if it doesn’t come back, return to the menu and rejoin.
        </p>
        <Button variant="goldOutline" onClick={() => leaveToCharacterSelect()}>
          Return to menu
        </Button>
      </div>
    </div>
  );
}
