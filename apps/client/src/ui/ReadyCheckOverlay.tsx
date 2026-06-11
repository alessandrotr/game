import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { READY_CHECK_MS, type LobbySlotView, type LobbyView, type Team } from '@arena/shared';
import { useLobbyStore } from '../store/useLobbyStore';
import { sendAcceptMatch, sendDeclineMatch } from '../network/colyseus';
import { Button, Card, Overlay } from './primitives';
import { TEAM_COLORS, TEAM_LABELS } from './theme';

/** Seconds left until the ready-check deadline (server-stamped, epoch ms). */
function secondsLeft(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/**
 * The League-style ready-check (Phase 12). Pops over everything when the
 * player's lobby fills: each participant must Accept before the countdown ends.
 * The match starts only when everyone accepts; a decline or timeout sends the
 * rest back to the open lobby. Not dismissible — Accept or Decline only.
 */
export function ReadyCheckOverlay({ lobby }: { lobby: LobbyView }) {
  const mySessionId = useLobbyStore((s) => s.mySessionId);
  const [remaining, setRemaining] = useState(() => secondsLeft(lobby.readyDeadline));

  useEffect(() => {
    setRemaining(secondsLeft(lobby.readyDeadline));
    const id = setInterval(() => setRemaining(secondsLeft(lobby.readyDeadline)), 250);
    return () => clearInterval(id);
  }, [lobby.readyDeadline]);

  const slots = [...lobby.blue, ...lobby.red].filter((s) => s.sessionId !== '');
  const accepted = slots.filter((s) => s.accepted).length;
  const myAccepted = slots.find((s) => s.sessionId === mySessionId)?.accepted ?? false;
  const total = Math.max(1, READY_CHECK_MS / 1000);
  const progress = Math.min(1, remaining / total);

  return (
    <Overlay closeOnBackdrop={false}>
      <Card variant="modal" className="w-[420px]">
        <div className="px-6 py-5 text-center">
          <div className="font-display text-2xl font-bold tracking-wide text-gold">
            Match Ready
          </div>
          <div className="mt-1 text-xs text-muted">
            {accepted}/{slots.length} accepted · {remaining}s
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-200 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 px-6 pb-4">
          <TeamTicks team="blue" slots={lobby.blue} mySessionId={mySessionId} />
          <TeamTicks team="red" slots={lobby.red} mySessionId={mySessionId} />
        </div>

        <div className="flex gap-2 px-6 pb-5">
          {myAccepted ? (
            <div className="flex-1 rounded-xl border border-positive/40 bg-positive/10 py-2.5 text-center text-sm font-semibold text-positive">
              Accepted — waiting for others…
            </div>
          ) : (
            <>
              <Button
                variant="gold"
                className="flex-1 gap-1.5 py-2.5"
                onClick={() => sendAcceptMatch()}
              >
                <Check size={16} aria-hidden="true" />
                Accept
              </Button>
              <Button
                variant="panel"
                className="gap-1.5 px-5 py-2.5"
                onClick={() => sendDeclineMatch()}
              >
                <X size={16} aria-hidden="true" />
                Decline
              </Button>
            </>
          )}
        </div>
      </Card>
    </Overlay>
  );
}

/** One team's accept indicators (a tick per occupied slot). */
function TeamTicks({
  team,
  slots,
  mySessionId,
}: {
  team: Team;
  slots: LobbySlotView[];
  mySessionId: string | null;
}) {
  const color = TEAM_COLORS[team];
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color }}>
        {TEAM_LABELS[team]}
      </div>
      <div className="flex flex-col gap-1">
        {slots
          .filter((s) => s.sessionId !== '')
          .map((slot) => {
            const isMe = slot.sessionId === mySessionId;
            return (
              <div
                key={slot.index}
                className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5 text-sm"
              >
                <span className={isMe ? 'font-semibold text-text' : 'text-text'}>
                  {slot.name}
                  {isMe && <span className="ml-1 text-[10px] text-muted">(you)</span>}
                </span>
                {slot.accepted ? (
                  <Check size={15} className="text-positive" aria-hidden="true" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border border-white/25" aria-hidden="true" />
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
