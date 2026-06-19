import { useState } from 'react';
import { Swords, ChevronRight, Circle, X } from 'lucide-react';
import {
  LOBBY_MODES,
  LOBBY_NAME_MAX_LENGTH,
  teamSizeForMode,
  type LobbyMode,
  type LobbySlotView,
  type LobbyView,
} from '@arena/shared';
import { useLobbyStore, type ModeFilter } from '../store/useLobbyStore';
import { useFocusStore } from '../store/useFocusStore';
import { sendCreateLobby } from '../network/colyseus';
import { Button, Card, Input, Overlay } from './primitives';
import { TEAM_COLORS } from './theme';

const STATUS_LABEL: Record<LobbyView['status'], string> = {
  queuing: 'Open',
  ready_check: 'Ready check',
  playing: 'Live',
};
const STATUS_TONE: Record<LobbyView['status'], string> = {
  queuing: 'text-positive',
  ready_check: 'text-cast',
  playing: 'text-negative',
};

/**
 * The matchmaking browser, styled as a game lobby: pick a FORMAT tile (the team
 * sizes shown as blue-vs-red pips), name your duel and hit the CREATE call-out, or
 * scan the open-duel cards — each shows its team fill as colored slot pips and a
 * glowing status so occupancy reads instantly. Clicking an open card selects it to
 * pick a slot in {@link LobbyView}. Docks right during the shrine's cinematic focus.
 */
export function MatchmakingMenu({ myLobby }: { myLobby: LobbyView | null }) {
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
  const docked = useFocusStore((s) => s.panel === 'pvp' && !!s.target);

  // You can only be in one match at a time: while a member, creating and joining
  // OTHER lobbies is blocked. Your own match opens the standalone queue dialog (a
  // main-HUD element), independent of this menu.
  const inMatch = !!myLobby;
  const openQueue = useLobbyStore((s) => s.setQueueOpen);

  const visible = lobbies
    .filter((l) => modeFilter === 'all' || l.mode === modeFilter)
    .filter((l) => (statusFilter === 'in-queue' ? l.status === 'queuing' : true));

  const create = () => {
    if (inMatch) return; // already in a match — one at a time
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name your duel first.');
      return;
    }
    setError(null);
    sendCreateLobby(trimmed, mode);
    setName('');
  };

  return (
    <Overlay onClose={() => setMenuOpen(false)} closeOnEscape dock={docked ? 'right' : 'center'} transparent={docked}>
      <Card
        variant="modal"
        style={{ containerType: 'inline-size' }}
        className={`flex max-h-[85vh] flex-col overflow-hidden border-white/10 bg-panel/55 backdrop-blur-2xl ${docked ? 'w-[clamp(32rem,38vw,48rem)]' : 'w-[min(560px,94vw)]'}`}
      >
        {/* Slim header — just the title + close (the cinematic focus shows the big
            title on the left; centered, this keeps context). */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 className="flex items-center gap-2 font-display text-[clamp(0.95rem,2.8cqi,1.3rem)] font-semibold tracking-wide text-text">
            <Swords size={16} className="text-gold" aria-hidden="true" />
            Trial of Blades
          </h2>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg p-1 text-muted transition hover:bg-white/10 hover:text-text"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 pt-3">
          {/* Create — format tiles + name + CTA. While you're in a match these stay
              put but DISABLED (one match at a time) — manage yours from the queue. */}
          <section className="rounded-2xl border border-white/10 bg-black/15 p-3.5">
            <SectionLabel>{inMatch ? 'Already in a match' : 'Choose your format'}</SectionLabel>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {LOBBY_MODES.map((m) => (
                <ModeTile key={m} mode={m} active={mode === m} disabled={inMatch} onClick={() => setMode(m)} />
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 @[26rem]:flex-row @[26rem]:items-stretch">
              <Input
                value={name}
                maxLength={LOBBY_NAME_MAX_LENGTH}
                placeholder="Name your duel…"
                tone="gold"
                className="flex-1"
                disabled={inMatch}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
              <Button
                variant="goldCta"
                size="lg"
                className="shrink-0 justify-center gap-2 px-6 disabled:cursor-not-allowed"
                disabled={inMatch || !name.trim()}
                onClick={create}
              >
                <Swords size={16} aria-hidden="true" />
                Create
              </Button>
            </div>
          </section>

          {/* Browser */}
          <section className="flex min-h-0 flex-col">
            <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <SectionLabel className="mr-auto">Open duels · {visible.length}</SectionLabel>
              <SegGroup>
                <FilterPill label="All sizes" active={modeFilter === 'all'} onClick={() => setModeFilter('all')} />
                {LOBBY_MODES.map((m) => (
                  <FilterPill key={m} label={m} active={modeFilter === m} onClick={() => setModeFilter(m as ModeFilter)} />
                ))}
              </SegGroup>
              <SegGroup>
                <FilterPill label="Open" active={statusFilter === 'in-queue'} onClick={() => setStatusFilter('in-queue')} />
                <FilterPill label="All" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
              </SegGroup>
            </div>

            {error && (
              <div className="mb-2.5 rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
                {error}
              </div>
            )}

            {visible.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="grid grid-cols-1 gap-2 @[42rem]:grid-cols-2">
                {visible.map((lobby) => {
                  const mine = lobby.id === myLobby?.id;
                  return (
                    <LobbyCard
                      key={lobby.id}
                      lobby={lobby}
                      mine={mine}
                      // In a match → only your own card is interactive; the rest are
                      // locked so you can't join a second. Your card opens the
                      // standalone queue dialog; others open the join preview.
                      locked={inMatch && !mine}
                      onSelect={() => {
                        setError(null);
                        if (mine) openQueue(true);
                        else setSelectedLobbyId(lobby.id);
                      }}
                    />
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </Card>
    </Overlay>
  );
}

/** Filled/empty colored pips for one team's slots — occupancy at a glance. */
function TeamPips({ slots, color }: { slots: LobbySlotView[]; color: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {slots.map((s, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full transition"
          style={{
            backgroundColor: s.sessionId ? color : 'transparent',
            boxShadow: `inset 0 0 0 1.5px ${color}`,
            opacity: s.sessionId ? 1 : 0.4,
          }}
        />
      ))}
    </span>
  );
}

/** Per-format role label, cleaner than a pip cluster on the picker. */
const FORMAT_ROLE: Record<number, string> = { 1: 'Solo', 2: 'Duo', 3: 'Trio', 4: 'Squad', 5: 'Team' };

/** A selectable format tile: the mode big with a quiet role label under it. */
function ModeTile({
  mode,
  active,
  disabled,
  onClick,
}: {
  mode: LobbyMode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={
        'flex flex-col items-center gap-0.5 rounded-xl border py-2.5 transition disabled:cursor-not-allowed disabled:opacity-40 ' +
        (active
          ? 'border-gold bg-gold/15 text-gold shadow-[inset_0_0_18px_rgba(200,162,74,0.18)]'
          : 'border-white/10 bg-black/20 text-text enabled:hover:border-white/30 enabled:hover:bg-black/30')
      }
    >
      <span className="font-display text-lg font-black leading-none tracking-wide">{mode}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50">
        {FORMAT_ROLE[teamSizeForMode(mode)]}
      </span>
    </button>
  );
}

/** A browsable lobby as a tactile card: name, mode, team-fill pips, glowing status,
 *  and a join chevron that slides in on hover. `mine` flags your own match (gold
 *  ring + badge, always openable); `locked` greys out others while you're queued. */
function LobbyCard({
  lobby,
  mine,
  locked,
  onSelect,
}: {
  lobby: LobbyView;
  mine: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  const open = lobby.status === 'queuing';
  // Your own card is always openable; otherwise it must be open AND not locked.
  const interactive = mine || (open && !locked);
  const filled = [...lobby.blue, ...lobby.red].filter((s) => s.sessionId !== '').length;
  const capacity = lobby.blue.length + lobby.red.length;
  return (
    <li>
      <button
        type="button"
        disabled={!interactive}
        onClick={onSelect}
        className={
          'group relative flex w-full flex-col gap-2.5 overflow-hidden rounded-xl border bg-linear-to-b from-white/4 to-transparent p-3 text-left transition disabled:opacity-45 ' +
          (mine
            ? 'border-gold/60 from-gold/10'
            : 'border-white/10 enabled:hover:border-gold/50 enabled:hover:from-gold/10')
        }
      >
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-gold/15 px-2 py-0.5 font-display text-xs font-bold tracking-wide text-gold ring-1 ring-gold/25">
            {lobby.mode}
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold text-text">{lobby.name}</span>
          {mine ? (
            <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
              Your match
            </span>
          ) : (
            <span className={'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ' + STATUS_TONE[lobby.status]}>
              <Circle size={7} className="fill-current" aria-hidden="true" />
              {STATUS_LABEL[lobby.status]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <TeamPips slots={lobby.blue} color={TEAM_COLORS.blue} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">vs</span>
          <TeamPips slots={lobby.red} color={TEAM_COLORS.red} />
          <span className="ml-auto flex items-center gap-1 text-xs tabular-nums text-muted">
            {filled}/{capacity}
            <ChevronRight
              size={16}
              className="text-gold opacity-0 transition group-enabled:group-hover:translate-x-0.5 group-enabled:group-hover:opacity-100"
              aria-hidden="true"
            />
          </span>
        </div>
      </button>
    </li>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/80 ' + className}>
      <span className="h-px w-5 bg-linear-to-r from-gold/70 to-transparent" />
      {children}
    </span>
  );
}

/** A segmented group wrapper that hugs its pills as one control. */
function SegGroup({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1">{children}</div>;
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-md px-2.5 py-1 text-xs font-medium transition ' +
        (active ? 'bg-gold/20 text-gold' : 'text-muted hover:text-text')
      }
    >
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center gap-2.5 rounded-xl bg-black/15 px-4 py-6 text-center">
      <Swords size={16} className="shrink-0 text-muted/60" aria-hidden="true" />
      <p className="text-sm text-muted">No open duels yet — create one and wait for a challenger.</p>
    </div>
  );
}
