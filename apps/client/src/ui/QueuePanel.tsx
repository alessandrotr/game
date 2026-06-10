import { useMatchmakingStore } from '../store/useMatchmakingStore';
import { sendQueue, sendUnqueue } from '../network/colyseus';

/**
 * Town matchmaking control (Phase 11): a button to queue for a 1v1, and a
 * searching state with a cancel. When the server pairs two players it sends a
 * seat reservation and the client auto-joins the match arena.
 */
export function QueuePanel() {
  const searching = useMatchmakingStore((s) => s.searching);
  const size = useMatchmakingStore((s) => s.size);

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
      {searching ? (
        <button
          type="button"
          onClick={sendUnqueue}
          className="font-display pointer-events-auto rounded-xl border border-gold/50 bg-panel/90 px-5 py-2.5 text-sm tracking-wide text-gold transition hover:brightness-110"
        >
          ⚔ Searching for match… {size > 1 ? `(${size} queued)` : ''} ·{' '}
          <span className="text-muted">cancel</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={sendQueue}
          className="font-display pointer-events-auto rounded-xl border border-gold/60 bg-gradient-to-b from-gold to-[#9c7a2c] px-5 py-2.5 text-sm font-semibold tracking-wide text-black shadow-[0_6px_20px_rgba(200,162,74,0.25)] transition hover:brightness-110"
        >
          Find 1v1 Match
        </button>
      )}
    </div>
  );
}
