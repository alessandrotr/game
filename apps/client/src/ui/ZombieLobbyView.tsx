import { LogOut, Play, Skull, Users, X } from 'lucide-react';
import { ZOMBIE_COOP_MAX_PLAYERS, type ZombieLobbyView as Lobby } from '@arena/shared';
import { useZombieLobbyStore } from '../store/useZombieLobbyStore';
import { sendZombieLeaveLobby, sendZombieStartMatch } from '../network/colyseus';
import { Badge, Button, Card, Overlay } from './primitives';

/**
 * A co-op Zombie squad's detail: the member list, the private share code (so the
 * host can invite friends), and the controls — the host launches the run (1–5
 * players), everyone else waits. Leaving drops you from the squad.
 */
export function ZombieLobbyView({ lobby }: { lobby: Lobby }) {
  const mySessionId = useZombieLobbyStore((s) => s.mySessionId);
  const setMenuOpen = useZombieLobbyStore((s) => s.setMenuOpen);
  const error = useZombieLobbyStore((s) => s.error);
  const setError = useZombieLobbyStore((s) => s.setError);

  const isHost = lobby.hostId === mySessionId;

  const leave = () => {
    sendZombieLeaveLobby();
    setError(null);
  };

  return (
    <Overlay onClose={() => setMenuOpen(false)} closeOnEscape>
      <Card variant="modal" className="w-[460px]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <Skull size={18} className="text-gold" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold tracking-wide">{lobby.name}</h2>
            {lobby.isPrivate && (
              <Badge variant="gold" className="!px-2 !py-0.5">
                Private
              </Badge>
            )}
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

        {/* Share code for private squads. */}
        {lobby.isPrivate && lobby.code && (
          <div className="mx-6 mt-4 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-center">
            <div className="text-[11px] uppercase tracking-wider text-muted">Squad code</div>
            <div className="mt-1 font-display text-2xl font-bold tracking-[0.4em] text-gold">
              {lobby.code}
            </div>
            <div className="mt-1 text-[11px] text-muted">Share it so friends can join.</div>
          </div>
        )}

        <div className="px-6 py-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            <Users size={13} aria-hidden="true" />
            Squad · {lobby.members.length}/{ZOMBIE_COOP_MAX_PLAYERS}
          </div>
          <div className="flex flex-col gap-1.5">
            {lobby.members.map((m) => {
              const isMe = m.sessionId === mySessionId;
              const isLobbyHost = m.sessionId === lobby.hostId;
              return (
                <div
                  key={m.sessionId}
                  className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-sm"
                  style={isMe ? { boxShadow: 'inset 0 0 0 1px rgba(200,162,74,0.6)' } : undefined}
                >
                  <span className={isMe ? 'font-semibold text-text' : 'text-text'}>
                    {m.name}
                    {isMe && <span className="ml-1 text-[10px] text-muted">(you)</span>}
                    {isLobbyHost && <span className="ml-1 text-[10px] text-gold">host</span>}
                  </span>
                  <span className="text-xs capitalize text-muted">{m.characterClass}</span>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mx-6 mb-2 rounded-lg bg-negative/10 px-3 py-2 text-xs text-negative">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
          <Button variant="goldOutline" size="sm" className="gap-1.5 px-4" onClick={leave}>
            <LogOut size={14} aria-hidden="true" />
            Leave
          </Button>
          {isHost ? (
            <Button
              variant="gold"
              size="sm"
              className="gap-1.5 px-5"
              onClick={() => {
                setError(null);
                sendZombieStartMatch();
              }}
            >
              <Play size={14} aria-hidden="true" />
              Start run
            </Button>
          ) : (
            <span className="text-xs text-muted">Waiting for the host to start…</span>
          )}
        </div>
      </Card>
    </Overlay>
  );
}
