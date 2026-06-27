import { useEffect, useState } from 'react';
import { LogOut, RotateCcw } from 'lucide-react';
import { sendRematchVote, travelTo } from '../network/colyseus';
import { useRematchStore } from '../store/useRematchStore';
import { Button } from './primitives';

/**
 * Post-match rematch controls, shared by the arena (PvP) and zombie defeat
 * screens. While the server's vote window is open it offers "Rematch" (accept) and
 * "Return to Town" (decline → everyone leaves), with a live ready tally + countdown.
 * Before any vote arrives (or against an older server) it falls back to a plain
 * town button so the player is never stuck.
 */
export function RematchControls() {
  const active = useRematchStore((s) => s.active);
  const ready = useRematchStore((s) => s.ready);
  const total = useRematchStore((s) => s.total);
  const accepted = useRematchStore((s) => s.accepted);
  const deadlineMs = useRematchStore((s) => s.deadlineMs);

  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!active || !deadlineMs) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [active, deadlineMs]);

  const accept = () => {
    useRematchStore.getState().markAccepted();
    sendRematchVote(true);
  };
  const leave = () => {
    sendRematchVote(false);
    void travelTo('town');
  };

  if (!active) {
    return (
      <Button
        variant="gold"
        onClick={() => void travelTo('town')}
        className="w-full px-5 py-2.5 shadow-none"
      >
        Return to Town
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {accepted ? (
        <Button variant="goldOutline" disabled className="w-full gap-1.5 px-5 py-2.5">
          <RotateCcw size={15} aria-hidden />
          Waiting for players… {ready}/{total}
        </Button>
      ) : (
        <Button variant="gold" onClick={accept} className="w-full gap-1.5 px-5 py-2.5 shadow-none">
          <RotateCcw size={15} aria-hidden />
          Rematch{secondsLeft > 0 ? ` · ${secondsLeft}s` : ''}
        </Button>
      )}
      <Button variant="goldOutline" onClick={leave} className="w-full gap-1.5 px-5 py-2.5">
        <LogOut size={15} aria-hidden />
        Return to Town
      </Button>
      <div className="text-center text-[11px] text-muted">
        {ready}/{total} ready to rematch
        {!accepted && total > 1 ? ' · everyone must accept' : ''}
      </div>
    </div>
  );
}
