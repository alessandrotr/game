import { useEffect, useState } from 'react';
import { Swords } from 'lucide-react';
import { useInviteStore } from '../store/useInviteStore';
import { sendInviteRespond } from '../network/colyseus';
import { Button } from './primitives';

/** Auto-decline (dismiss) if untouched — a touch under the server's invite TTL. */
const VISIBLE_MS = 25000;

/**
 * Incoming match-invite prompt. Pops when another player invites you (from their
 * paperdoll) to a 1v1 / team format, with Accept / Decline. Accepting joins the
 * duel (1v1) or queues you on their team (2v2+); declining (or letting it lapse)
 * dismisses it. Keyed off the store's `nonce` so back-to-back invites re-trigger.
 */
export function InviteToast() {
  const invite = useInviteStore((s) => s.invite);
  const nonce = useInviteStore((s) => s.nonce);
  const clear = useInviteStore((s) => s.clear);
  const [shownNonce, setShownNonce] = useState(0);

  useEffect(() => {
    if (!invite) return;
    setShownNonce(nonce);
    const id = setTimeout(clear, VISIBLE_MS);
    return () => clearTimeout(id);
  }, [invite, nonce, clear]);

  if (!invite) return null;

  const respond = (accept: boolean) => {
    sendInviteRespond(invite.inviteId, accept);
    clear();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-[14%] z-toast -translate-x-1/2"
    >
      <div
        key={shownNonce}
        className="pointer-events-auto flex items-center gap-3 rounded-xl border border-gold/50 bg-panel/90 px-4 py-3 shadow-lg backdrop-blur-md"
      >
        <Swords size={18} className="shrink-0 text-gold" aria-hidden="true" />
        <div className="text-sm">
          <span className="font-semibold text-text">{invite.fromName}</span>
          <span className="text-muted"> challenges you to a </span>
          <span className="font-display font-bold text-gold">{invite.mode}</span>
          <span className="text-muted">!</span>
        </div>
        <div className="ml-1 flex items-center gap-2">
          <Button variant="goldCta" size="sm" className="px-3" onClick={() => respond(true)}>
            Accept
          </Button>
          <Button size="sm" className="px-3" onClick={() => respond(false)}>
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
