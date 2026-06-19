import { LogOut, Play, Skull, X } from 'lucide-react';
import { ZOMBIE_COOP_MAX_PLAYERS, type ZombieLobbyView as Lobby } from '@arena/shared';
import { useZombieLobbyStore } from '../store/useZombieLobbyStore';
import { sendZombieLeaveLobby, sendZombieStartMatch } from '../network/colyseus';
import { Button, Card, Overlay } from './primitives';
import { STAT_COLORS } from './theme';

/**
 * A co-op Zombie squad's detail (your queue) — the member roster, the private
 * share code, and the host's Start control. Styled to match the matchmaking menu
 * (frosted panel, slim header, gold section labels, breathing roster pips).
 * Self-contained: closing runs the host-supplied `onClose`.
 */
export function ZombieLobbyView({ lobby, onClose }: { lobby: Lobby; onClose: () => void }) {
  const mySessionId = useZombieLobbyStore((s) => s.mySessionId);
  const error = useZombieLobbyStore((s) => s.error);
  const setError = useZombieLobbyStore((s) => s.setError);

  const isHost = lobby.hostId === mySessionId;
  const filled = lobby.members.length;

  const leave = () => {
    sendZombieLeaveLobby();
    setError(null);
    onClose();
  };

  return (
    <Overlay onClose={onClose} closeOnEscape>
      <Card
        variant="modal"
        style={{ containerType: 'inline-size' }}
        className="flex max-h-[85vh] w-[min(480px,94vw)] flex-col overflow-hidden border-white/10 bg-panel/55 backdrop-blur-2xl"
      >
        {/* Slim header — crest + name + private tag + close. */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 className="flex min-w-0 items-center gap-2.5">
            <Skull size={16} className="text-gold" aria-hidden="true" />
            <span className="min-w-0 truncate font-display text-[clamp(0.95rem,2.8cqi,1.3rem)] font-semibold tracking-wide text-text">
              {lobby.name}
            </span>
            {lobby.isPrivate && (
              <span className="rounded-md bg-gold/15 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-gold ring-1 ring-gold/25">
                Private
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted transition hover:bg-white/10 hover:text-text"
            aria-label="Back"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5 pt-3">
          {/* Share code (private squads). */}
          {lobby.isPrivate && lobby.code && (
            <div className="rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3 text-center">
              <div className="text-[11px] uppercase tracking-wider text-muted">Squad code</div>
              <div className="mt-1 font-display text-2xl font-bold tracking-[0.4em] text-gold">{lobby.code}</div>
              <div className="mt-1 text-[11px] text-muted">Share it so friends can join.</div>
            </div>
          )}

          {/* Roster */}
          <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <SectionLabel>Squad · {filled}/{ZOMBIE_COOP_MAX_PLAYERS}</SectionLabel>
              <SquadPips filled={filled} capacity={ZOMBIE_COOP_MAX_PLAYERS} />
            </div>
            <div className="flex flex-col gap-1.5">
              {lobby.members.map((m) => {
                const isMe = m.sessionId === mySessionId;
                const isLobbyHost = m.sessionId === lobby.hostId;
                return (
                  <div
                    key={m.sessionId}
                    className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-sm"
                    style={isMe ? { boxShadow: 'inset 0 0 0 1.5px rgba(200,162,74,0.6)' } : undefined}
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
            <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </div>
          )}

          <div className="mt-1 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
            <Button variant="goldOutline" size="sm" className="shrink-0 gap-1.5 px-3" onClick={leave}>
              <LogOut size={14} aria-hidden="true" />
              Leave
            </Button>
            {isHost ? (
              <Button
                variant="goldCta"
                size="sm"
                className="shrink-0 gap-1.5 px-5"
                onClick={() => {
                  setError(null);
                  sendZombieStartMatch();
                }}
              >
                <Play size={14} aria-hidden="true" />
                Start run
              </Button>
            ) : (
              <span className="text-sm text-muted">Waiting for the host to start…</span>
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

/** Roster pips — filled for members, empty ones breathe (staggered) as "waiting". */
function SquadPips({ filled, capacity }: { filled: number; capacity: number }) {
  const color = STAT_COLORS.positive;
  let emptyIdx = 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      {Array.from({ length: capacity }, (_, i) => {
        const occupied = i < filled;
        const delay = occupied ? 0 : emptyIdx++ * 0.18;
        return (
          <span
            key={i}
            className={'h-2 w-2 rounded-full ' + (occupied ? '' : 'animate-[slot-wait_1.4s_ease-in-out_infinite]')}
            style={{
              backgroundColor: occupied ? color : 'transparent',
              boxShadow: `inset 0 0 0 1.5px ${color}`,
              opacity: occupied ? 1 : 0.4,
              animationDelay: occupied ? undefined : `${delay}s`,
            }}
          />
        );
      })}
    </span>
  );
}
