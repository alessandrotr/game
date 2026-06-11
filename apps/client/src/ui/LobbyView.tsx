import { ArrowLeft, LogOut, Plus, X } from 'lucide-react';
import type { LobbySlotView, LobbyView as Lobby, Team } from '@arena/shared';
import { useLobbyStore } from '../store/useLobbyStore';
import { sendJoinSlot, sendLeaveLobby } from '../network/colyseus';
import { Badge, Button, Card, Overlay } from './primitives';
import { TEAM_COLORS, TEAM_LABELS } from './theme';

/**
 * A single lobby's detail (Phase 12): the Blue and Red team columns with every
 * slot. Players click an open slot to take it (joining the lobby, or switching
 * sides) — so friends can deliberately pick the same team. Host can be anyone;
 * the lobby starts a ready-check automatically once every slot is filled.
 */
export function LobbyView({ lobby, isMember }: { lobby: Lobby; isMember: boolean }) {
  const mySessionId = useLobbyStore((s) => s.mySessionId);
  const setMenuOpen = useLobbyStore((s) => s.setMenuOpen);
  const setSelectedLobbyId = useLobbyStore((s) => s.setSelectedLobbyId);
  const error = useLobbyStore((s) => s.error);
  const setError = useLobbyStore((s) => s.setError);

  const leave = () => {
    sendLeaveLobby();
    setSelectedLobbyId(null);
    setError(null);
  };
  const back = () => {
    setSelectedLobbyId(null);
    setError(null);
  };
  const join = (team: Team, index: number) => {
    setError(null);
    sendJoinSlot(lobby.id, team, index);
  };

  return (
    <Overlay onClose={() => setMenuOpen(false)} closeOnEscape>
      <Card variant="modal" className="w-[600px]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <Badge variant="gold" className="!px-2 !py-0.5">
              {lobby.mode}
            </Badge>
            <h2 className="font-display text-lg font-semibold tracking-wide">{lobby.name}</h2>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="text-muted transition hover:text-text"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          <TeamColumn
            team="blue"
            slots={lobby.blue}
            mySessionId={mySessionId}
            joinable={lobby.status === 'queuing'}
            onJoin={join}
          />
          <TeamColumn
            team="red"
            slots={lobby.red}
            mySessionId={mySessionId}
            joinable={lobby.status === 'queuing'}
            onJoin={join}
          />
        </div>

        {error && (
          <div className="mx-6 mb-2 rounded-lg bg-negative/10 px-3 py-2 text-xs text-negative">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
          <div className="text-xs text-muted">
            {isMember ? 'Waiting for all slots to fill…' : 'Pick a slot to join.'}
          </div>
          {isMember ? (
            <Button variant="goldOutline" size="sm" className="gap-1.5 px-4" onClick={leave}>
              <LogOut size={14} aria-hidden="true" />
              Leave lobby
            </Button>
          ) : (
            <Button variant="panel" size="sm" className="gap-1.5 px-4" onClick={back}>
              <ArrowLeft size={14} aria-hidden="true" />
              Back to list
            </Button>
          )}
        </div>
      </Card>
    </Overlay>
  );
}

/** One team's column of slots; empty slots become "Join" buttons when joinable. */
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
  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
    >
      <div
        className="mb-2 text-xs font-semibold uppercase tracking-wider"
        style={{ color }}
      >
        {TEAM_LABELS[team]} team
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
                style={isMe ? { boxShadow: `inset 0 0 0 1px ${color}` } : undefined}
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
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-muted transition enabled:hover:border-white/40 enabled:hover:text-text disabled:opacity-50"
            >
              <Plus size={13} aria-hidden="true" />
              Open slot
            </button>
          );
        })}
      </div>
    </div>
  );
}
