import { Swords } from 'lucide-react';
import { useMatchmakingStore } from '../store/useMatchmakingStore';
import { sendQueue, sendUnqueue } from '../network/colyseus';
import { Button } from './primitives';

/**
 * Town matchmaking control (Phase 11): a button to queue for a 1v1, and a
 * searching state with a cancel. When the server pairs two players it sends a
 * seat reservation and the client auto-joins the match arena.
 */
export function QueuePanel() {
  const searching = useMatchmakingStore((s) => s.searching);
  const size = useMatchmakingStore((s) => s.size);

  return (
    <div className="pointer-events-none absolute right-4 top-14 flex justify-end">
      {searching ? (
        <Button
          variant="goldOutline"
          onClick={sendUnqueue}
          className="pointer-events-auto gap-1.5 px-5 py-2.5"
        >
          <Swords size={15} aria-hidden="true" />
          Searching for match… {size > 1 ? `(${size} queued)` : ''} ·{' '}
          <span className="text-muted">cancel</span>
        </Button>
      ) : (
        <Button
          variant="gold"
          onClick={sendQueue}
          className="pointer-events-auto px-5 py-2.5 shadow-[0_6px_20px_rgba(200,162,74,0.25)]"
        >
          Find 1v1 Match
        </Button>
      )}
    </div>
  );
}
