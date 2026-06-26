import { useEffect, useState } from 'react';
import { Swords, X } from 'lucide-react';
import { QUEUE_BOT_FILL_MS } from '@arena/shared';
import {
  capacityForMode,
  countForMode,
  myQueueMode,
  useQueueStore,
} from '../store/useQueueStore';
import { useHudStore } from '../store/useHudStore';
import { sendLeaveQueue } from '../network/colyseus';

/**
 * The player's own queue status, as a MAIN-HUD element independent of the
 * matchmaking panel and the cinematic focus: a notification-style badge pinned
 * top-right whenever you're queued for a format, showing the live fill and a
 * countdown to the bot-fill fallback. Clicking it leaves the queue. When the queue
 * fills the server pulls you straight into the arena (no ready-check).
 */
export function MatchQueue() {
  const members = useQueueStore((s) => s.members);
  const mySessionId = useQueueStore((s) => s.mySessionId);
  // The perf readout shares the top-right corner — when it's shown, drop below it.
  const showPerf = useHudStore((s) => s.showPerf);

  // Re-render every second so the bot-fill countdown ticks (snapshots only arrive
  // when the queue membership changes, not per-second).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const mode = myQueueMode(members, mySessionId);
  if (!mode) return null;

  const count = countForMode(members, mode);
  const capacity = capacityForMode(mode);
  // Bot-fill triggers off the OLDEST queuer in this format. Approximate (server
  // vs client clock), clamped to the window, so it reads "bots in ~Xs".
  const oldest = members.reduce(
    (min, m) => (m.mode === mode ? Math.min(min, m.enqueuedAt) : min),
    Infinity,
  );
  const remainingMs = Math.min(QUEUE_BOT_FILL_MS, Math.max(0, oldest + QUEUE_BOT_FILL_MS - now));
  const full = count >= capacity;

  return (
    <button
      type="button"
      onClick={() => sendLeaveQueue()}
      title="Leave queue"
      className={
        'pointer-events-auto fixed right-4 z-modal flex items-center gap-2 rounded-xl border border-gold/50 bg-panel/80 px-3 py-2 text-sm font-semibold tracking-wide text-gold shadow-lg backdrop-blur-md transition hover:bg-panel ' +
        (showPerf ? 'top-[68px]' : 'top-4')
      }
    >
      {/* Pulsing notification dot — your queue is live. */}
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
      </span>
      <Swords size={14} aria-hidden="true" />
      <span className="font-display">{mode}</span>
      <span className="tabular-nums text-gold/70">
        {count}/{capacity}
      </span>
      {/* Bot-fill countdown (hidden once a full human match is imminent). */}
      {!full && (
        <span className="border-l border-gold/30 pl-2 text-xs font-normal tabular-nums text-gold/60">
          {remainingMs > 0 ? `bots in ${Math.ceil(remainingMs / 1000)}s` : 'adding bots…'}
        </span>
      )}
      <X size={14} className="text-gold/60" aria-hidden="true" />
    </button>
  );
}
