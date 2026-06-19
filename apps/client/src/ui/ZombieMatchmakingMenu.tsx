import { useState } from 'react';
import { Skull, Users, X } from 'lucide-react';
import {
  LOBBY_NAME_MAX_LENGTH,
  ZOMBIE_COOP_MAX_PLAYERS,
  ZOMBIE_LOBBY_CODE_LENGTH,
  type ZombieLobbyView,
} from '@arena/shared';
import { useZombieLobbyStore } from '../store/useZombieLobbyStore';
import {
  sendZombieCreateLobby,
  sendZombieJoinByCode,
  sendZombieJoinLobby,
} from '../network/colyseus';
import { Badge, Button, Card, Input, Overlay } from './primitives';
import { useFocusStore } from '../store/useFocusStore';

/**
 * The co-op Zombie matchmaking browser: create a squad (public or private), join
 * a private squad by its share code, or pick a public squad to join. Picking a
 * squad joins it immediately (no slot/team choice — it's one shared squad), after
 * which {@link ZombieLobbyView} takes over.
 */
export function ZombieMatchmakingMenu() {
  const lobbies = useZombieLobbyStore((s) => s.lobbies);
  const error = useZombieLobbyStore((s) => s.error);
  const setMenuOpen = useZombieLobbyStore((s) => s.setMenuOpen);
  const setError = useZombieLobbyStore((s) => s.setError);

  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState('');
  // Docked to the right while the Breach shrine is cinematically focused.
  const docked = useFocusStore((s) => s.panel === 'coop' && !!s.target);

  // Only public, still-open squads are listed; private ones join by code.
  const visible = lobbies.filter((l) => !l.isPrivate && l.status === 'queuing');

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your squad a name.');
      return;
    }
    setError(null);
    sendZombieCreateLobby(trimmed, isPrivate);
    setName('');
  };

  const joinByCode = () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter a squad code.');
      return;
    }
    setError(null);
    sendZombieJoinByCode(trimmed);
    setCode('');
  };

  return (
    <Overlay onClose={() => setMenuOpen(false)} closeOnEscape dock={docked ? 'right' : 'center'} transparent={docked}>
      <Card variant="modal" className="flex max-h-[80vh] w-[600px] flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <Skull size={18} className="text-gold" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold tracking-wide">Zombie Co-op</h2>
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

        {/* Create a squad. */}
        <div className="border-b border-white/10 px-6 py-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Create a squad
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={name}
              maxLength={LOBBY_NAME_MAX_LENGTH}
              placeholder="Squad name"
              inputSize="sm"
              tone="gold"
              className="flex-1"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <div className="flex gap-1">
              <Toggle label="Public" active={!isPrivate} onClick={() => setIsPrivate(false)} />
              <Toggle label="Private" active={isPrivate} onClick={() => setIsPrivate(true)} />
            </div>
            <Button variant="gold" size="sm" className="px-4" onClick={create}>
              Create
            </Button>
          </div>
          <div className="mt-1.5 text-[11px] text-muted">
            {isPrivate
              ? 'Hidden from the list — share the code to invite your friends.'
              : 'Listed below for anyone to join.'}{' '}
            Up to {ZOMBIE_COOP_MAX_PLAYERS} players.
          </div>
        </div>

        {/* Join a private squad by code. */}
        <div className="border-b border-white/10 px-6 py-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Join by code
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={code}
              maxLength={ZOMBIE_LOBBY_CODE_LENGTH}
              placeholder="Squad code"
              inputSize="sm"
              tone="gold"
              className="flex-1 uppercase tracking-[0.3em]"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && joinByCode()}
            />
            <Button variant="panel" size="sm" className="px-4" onClick={joinByCode}>
              Join
            </Button>
          </div>
        </div>

        {error && (
          <div className="border-b border-negative/20 bg-negative/10 px-6 py-2 text-xs text-negative">
            {error}
          </div>
        )}

        {/* Public squad list. */}
        <div className="min-h-[140px] flex-1 overflow-y-auto px-6 py-3">
          {visible.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">
              No open squads — create one above.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {visible.map((lobby) => (
                <SquadRow
                  key={lobby.id}
                  lobby={lobby}
                  onJoin={() => {
                    setError(null);
                    sendZombieJoinLobby(lobby.id);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </Overlay>
  );
}

function SquadRow({ lobby, onJoin }: { lobby: ZombieLobbyView; onJoin: () => void }) {
  const full = lobby.members.length >= ZOMBIE_COOP_MAX_PLAYERS;
  return (
    <li>
      <button
        type="button"
        disabled={full}
        onClick={onJoin}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-left transition enabled:hover:border-gold/40 enabled:hover:bg-black/40 disabled:opacity-60"
      >
        <span className="flex items-center gap-3">
          <Badge variant="gold" className="!px-2 !py-0.5">
            Co-op
          </Badge>
          <span className="font-medium text-text">{lobby.name}</span>
        </span>
        <span className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1 tabular-nums">
            <Users size={12} aria-hidden="true" />
            {lobby.members.length}/{ZOMBIE_COOP_MAX_PLAYERS}
          </span>
          <span className={full ? 'text-muted' : 'text-positive'}>{full ? 'Full' : 'Open'}</span>
        </span>
      </button>
    </li>
  );
}

/** A small selectable pill for the public/private picker. */
function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-lg border px-2.5 py-1 text-xs transition ' +
        (active
          ? 'border-gold/60 bg-gold/15 text-gold'
          : 'border-white/10 text-muted hover:border-white/30 hover:text-text')
      }
    >
      {label}
    </button>
  );
}
