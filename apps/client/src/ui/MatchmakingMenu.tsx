import { useState } from 'react';
import { Swords, Users, X } from 'lucide-react';
import { LOBBY_MODES, LOBBY_NAME_MAX_LENGTH, type LobbyMode, type LobbyView } from '@arena/shared';
import { useLobbyStore, type ModeFilter } from '../store/useLobbyStore';
import { useFocusStore } from '../store/useFocusStore';
import { sendCreateLobby } from '../network/colyseus';
import { Badge, Button, Card, Input, Overlay } from './primitives';

/** Slots filled / total across both teams. */
function fill(lobby: LobbyView): { filled: number; capacity: number } {
  const slots = [...lobby.blue, ...lobby.red];
  return { filled: slots.filter((s) => s.sessionId !== '').length, capacity: slots.length };
}

const STATUS_LABEL: Record<LobbyView['status'], string> = {
  queuing: 'In queue',
  ready_check: 'Ready check',
  playing: 'Playing',
};

/**
 * The matchmaking browser (Phase 12): create a lobby (name + size) or pick an
 * open one to join. Filterable by match size and by status (open-only / all,
 * where "all" also shows in-progress duels). Clicking an open lobby selects it
 * so the player can choose a team slot in {@link LobbyView}.
 */
export function MatchmakingMenu() {
  const lobbies = useLobbyStore((s) => s.lobbies);
  const modeFilter = useLobbyStore((s) => s.modeFilter);
  const statusFilter = useLobbyStore((s) => s.statusFilter);
  const error = useLobbyStore((s) => s.error);
  const setModeFilter = useLobbyStore((s) => s.setModeFilter);
  const setStatusFilter = useLobbyStore((s) => s.setStatusFilter);
  const setMenuOpen = useLobbyStore((s) => s.setMenuOpen);
  const setSelectedLobbyId = useLobbyStore((s) => s.setSelectedLobbyId);
  const setError = useLobbyStore((s) => s.setError);

  const [name, setName] = useState('');
  const [mode, setMode] = useState<LobbyMode>('2v2');
  // Docked to the right while the duel shrine is cinematically focused.
  const docked = useFocusStore((s) => s.panel === 'pvp' && !!s.target);

  const visible = lobbies
    .filter((l) => modeFilter === 'all' || l.mode === modeFilter)
    .filter((l) => (statusFilter === 'in-queue' ? l.status === 'queuing' : true));

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your lobby a name.');
      return;
    }
    setError(null);
    sendCreateLobby(trimmed, mode);
    setName('');
  };

  return (
    <Overlay onClose={() => setMenuOpen(false)} closeOnEscape dock={docked ? 'right' : 'center'} transparent={docked}>
      <Card variant="modal" className="flex max-h-[80vh] w-[600px] flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <Swords size={18} className="text-gold" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold tracking-wide">Matchmaking</h2>
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

        {/* Create a lobby. */}
        <div className="border-b border-white/10 px-6 py-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Create a duel
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={name}
              maxLength={LOBBY_NAME_MAX_LENGTH}
              placeholder="Lobby name"
              inputSize="sm"
              tone="gold"
              className="flex-1"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <div className="flex gap-1">
              {LOBBY_MODES.map((m) => (
                <ModeChip key={m} label={m} active={mode === m} onClick={() => setMode(m)} />
              ))}
            </div>
            <Button variant="gold" size="sm" className="px-4" onClick={create}>
              Create
            </Button>
          </div>
        </div>

        {/* Filters. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-6 py-3 text-xs">
          <span className="text-muted">Size</span>
          <ModeChip label="All" active={modeFilter === 'all'} onClick={() => setModeFilter('all')} />
          {LOBBY_MODES.map((m) => (
            <ModeChip
              key={m}
              label={m}
              active={modeFilter === m}
              onClick={() => setModeFilter(m as ModeFilter)}
            />
          ))}
          <span className="ml-3 text-muted">Show</span>
          <ModeChip
            label="Open only"
            active={statusFilter === 'in-queue'}
            onClick={() => setStatusFilter('in-queue')}
          />
          <ModeChip label="All" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        </div>

        {error && (
          <div className="border-b border-negative/20 bg-negative/10 px-6 py-2 text-xs text-negative">
            {error}
          </div>
        )}

        {/* Lobby list. */}
        <div className="min-h-[160px] flex-1 overflow-y-auto px-6 py-3">
          {visible.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">
              No duels yet — create one above.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {visible.map((lobby) => {
                const { filled, capacity } = fill(lobby);
                const open = lobby.status === 'queuing';
                return (
                  <li key={lobby.id}>
                    <button
                      type="button"
                      disabled={!open}
                      onClick={() => {
                        setError(null);
                        setSelectedLobbyId(lobby.id);
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-left transition enabled:hover:border-gold/40 enabled:hover:bg-black/40 disabled:opacity-60"
                    >
                      <span className="flex items-center gap-3">
                        <Badge variant="gold" className="!px-2 !py-0.5">
                          {lobby.mode}
                        </Badge>
                        <span className="font-medium text-text">{lobby.name}</span>
                      </span>
                      <span className="flex items-center gap-3 text-xs text-muted">
                        <span className="flex items-center gap-1 tabular-nums">
                          <Users size={12} aria-hidden="true" />
                          {filled}/{capacity}
                        </span>
                        <span className={open ? 'text-positive' : 'text-muted'}>
                          {STATUS_LABEL[lobby.status]}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </Overlay>
  );
}

/** A small selectable pill used for both the create-mode picker and the filters. */
function ModeChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
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
