import { ArrowLeft, LogOut, Plus, X } from 'lucide-react';
import type { LobbySlotView, LobbyView as Lobby, Team } from '@arena/shared';
import { useLobbyStore } from '../store/useLobbyStore';
import { sendJoinSlot, sendLeaveLobby } from '../network/colyseus';
import { Button, Card, Overlay } from './primitives';
import { TEAM_COLORS, TEAM_LABELS } from './theme';

/**
 * A single lobby's team view — your match queue, or a browser preview to pick a
 * slot in. Styled to match the matchmaking menu (frosted panel, slim header, gold
 * section labels, team-colored columns with slot pills). Self-contained: closing
 * runs the host-supplied `onClose`; it never touches the menu or the camera focus.
 */
export function LobbyView({
  lobby,
  isMember,
  onClose,
}: {
  lobby: Lobby;
  isMember: boolean;
  onClose: () => void;
}) {
  const mySessionId = useLobbyStore((s) => s.mySessionId);
  const error = useLobbyStore((s) => s.error);
  const setError = useLobbyStore((s) => s.setError);

  const filled = [...lobby.blue, ...lobby.red].filter((s) => s.sessionId !== '').length;
  const capacity = lobby.blue.length + lobby.red.length;
  const joinable = lobby.status === 'queuing';

  const leave = () => {
    sendLeaveLobby();
    setError(null);
    onClose();
  };
  const back = () => {
    setError(null);
    onClose();
  };
  const join = (team: Team, index: number) => {
    setError(null);
    sendJoinSlot(lobby.id, team, index);
  };

  return (
    <Overlay onClose={back} closeOnEscape>
      <Card
        variant="modal"
        style={{ containerType: 'inline-size' }}
        className="flex max-h-[85vh] w-[min(560px,94vw)] flex-col overflow-hidden border-white/10 bg-panel/55 backdrop-blur-2xl"
      >
        {/* Slim header — mode pill + name + close. */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 className="flex min-w-0 items-center gap-2.5">
            <span className="rounded-md bg-gold/15 px-2 py-0.5 font-display text-xs font-bold tracking-wide text-gold ring-1 ring-gold/25">
              {lobby.mode}
            </span>
            <span className="min-w-0 truncate font-display text-[clamp(0.95rem,2.8cqi,1.3rem)] font-semibold tracking-wide text-text">
              {lobby.name}
            </span>
          </h2>
          <button
            type="button"
            onClick={back}
            className="rounded-lg p-1 text-muted transition hover:bg-white/10 hover:text-text"
            aria-label="Back"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5 pt-3">
          <SectionLabel>
            {isMember ? 'In queue' : 'Pick your side'} · {filled}/{capacity}
          </SectionLabel>

          <div className="grid grid-cols-2 gap-2.5">
            <TeamColumn team="blue" slots={lobby.blue} mySessionId={mySessionId} joinable={joinable} onJoin={join} />
            <TeamColumn team="red" slots={lobby.red} mySessionId={mySessionId} joinable={joinable} onJoin={join} />
          </div>

          {error && (
            <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </div>
          )}

          <div className="mt-1 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
            <span className="text-sm text-muted">
              {isMember ? 'Waiting for all slots to fill…' : 'Click an open slot to join.'}
            </span>
            {isMember ? (
              <Button variant="goldOutline" size="sm" className="shrink-0 gap-1.5 px-3" onClick={leave}>
                <LogOut size={14} aria-hidden="true" />
                Leave
              </Button>
            ) : (
              <Button variant="panel" size="sm" className="shrink-0 gap-1.5 px-3" onClick={back}>
                <ArrowLeft size={14} aria-hidden="true" />
                Back
              </Button>
            )}
          </div>
        </div>
      </Card>
    </Overlay>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/80">
      <span className="h-px w-5 bg-linear-to-r from-gold/70 to-transparent" />
      {children}
    </span>
  );
}

/** One team's column: a team-tinted card of slot pills; open slots become join buttons. */
function TeamColumn({
  team,
  slots,
  mySessionId,
  joinable,
  onJoin,
}: {
  team: Team;
  slots: LobbySlotView[];
  mySessionId: string | null;
  joinable: boolean;
  onJoin: (team: Team, index: number) => void;
}) {
  const color = TEAM_COLORS[team];
  const taken = slots.filter((s) => s.sessionId !== '').length;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color }}>
          {TEAM_LABELS[team]}
        </span>
        <span className="flex items-center gap-1.5">
          {slots.map((s, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: s.sessionId ? color : 'transparent',
                boxShadow: `inset 0 0 0 1.5px ${color}`,
                opacity: s.sessionId ? 1 : 0.4,
              }}
            />
          ))}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {slots.map((slot) => {
          const occupied = slot.sessionId !== '';
          const isMe = occupied && slot.sessionId === mySessionId;
          if (occupied) {
            return (
              <div
                key={slot.index}
                className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-sm"
                style={isMe ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}
              >
                <span className={isMe ? 'font-semibold text-text' : 'text-text'}>
                  {slot.name}
                  {isMe && <span className="ml-1 text-[10px] text-muted">(you)</span>}
                </span>
                <span className="text-xs capitalize text-muted">{slot.characterClass}</span>
              </div>
            );
          }
          return (
            <button
              key={slot.index}
              type="button"
              disabled={!joinable}
              onClick={() => onJoin(team, slot.index)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-muted transition enabled:hover:border-gold/50 enabled:hover:text-gold disabled:opacity-50"
            >
              <Plus size={13} aria-hidden="true" />
              Open slot
            </button>
          );
        })}
      </div>
      {/* keep `taken` meaningful for a11y/debug without an extra element */}
      <span className="sr-only">
        {taken}/{slots.length} filled
      </span>
    </div>
  );
}
