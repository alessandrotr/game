import { useMemo, useState } from 'react';
import { Skull, ChevronRight, Circle, Lock, Globe, KeyRound, X } from 'lucide-react';
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
import { Button, Card, Input, Overlay } from './primitives';
import { useFocusStore } from '../store/useFocusStore';
import { STAT_COLORS } from './theme';

/**
 * The co-op Zombie browser, styled as a game lobby: raise a squad (public or
 * private) with a bold CREATE call-out, drop a share code to join friends, or scan
 * the open-squad cards — each shows its roster as filled/empty pips so you read how
 * many seats are left at a glance. Picking a squad joins immediately; then
 * {@link ZombieLobbyView} takes over. Docks right during the Breach's cinematic focus.
 */
export function ZombieMatchmakingMenu({ myLobby }: { myLobby: ZombieLobbyView | null }) {
  const lobbies = useZombieLobbyStore((s) => s.lobbies);
  const error = useZombieLobbyStore((s) => s.error);
  const setMenuOpen = useZombieLobbyStore((s) => s.setMenuOpen);
  const openQueue = useZombieLobbyStore((s) => s.setQueueOpen);
  const setError = useZombieLobbyStore((s) => s.setError);

  // `name` is the user's edit; until they type, the field shows a generated default.
  const [name, setName] = useState('');
  const [edited, setEdited] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState('');
  const docked = useFocusStore((s) => s.panel === 'coop' && !!s.target);

  // One squad at a time: while in one, creating/joining others is blocked.
  const inSquad = !!myLobby;

  // Names already in use (case-insensitive) — keep the default unique.
  const taken = useMemo(
    () => new Set(lobbies.map((l) => l.name.trim().toLowerCase())),
    [lobbies],
  );
  const defaultName = useMemo(() => {
    let n = 1;
    while (taken.has(`squad ${n}`)) n++;
    return `Squad ${n}`;
  }, [taken]);
  const effectiveName = edited ? name : defaultName;
  const trimmedName = effectiveName.trim();
  const nameTaken = trimmedName !== '' && taken.has(trimmedName.toLowerCase());

  const visible = lobbies.filter((l) => !l.isPrivate && l.status === 'queuing');

  const create = () => {
    if (inSquad) return; // one squad at a time
    if (!trimmedName) {
      setError('Name your squad first.');
      return;
    }
    if (nameTaken) {
      setError('That name is already taken — pick another.');
      return;
    }
    setError(null);
    sendZombieCreateLobby(trimmedName, isPrivate);
    setName('');
    setEdited(false);
  };

  const joinByCode = () => {
    if (inSquad) return; // one squad at a time
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
      <Card
        variant="modal"
        style={{ containerType: 'inline-size' }}
        className={`flex max-h-[85vh] flex-col overflow-hidden border-white/10 bg-panel/55 backdrop-blur-2xl ${docked ? 'w-[clamp(32rem,38vw,48rem)]' : 'w-[min(560px,94vw)]'}`}
      >
        {/* Slim header — just the title + close. */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 className="flex items-center gap-2 font-display text-[clamp(0.95rem,2.8cqi,1.3rem)] font-semibold tracking-wide text-text">
            <Skull size={16} className="text-gold" aria-hidden="true" />
            The Breach
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
          {/* Create a squad — visibility toggle + name + CTA. Disabled while in a
              squad (one at a time) — manage yours from the queue. */}
          <section className="rounded-2xl border border-white/10 bg-black/15 p-3.5">
            <SectionLabel>{inSquad ? 'Already in a squad' : 'Raise a squad'}</SectionLabel>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <VisTile icon={Globe} label="Public" hint="Listed for anyone" active={!isPrivate} disabled={inSquad} onClick={() => setIsPrivate(false)} />
              <VisTile icon={Lock} label="Private" hint="Invite by code" active={isPrivate} disabled={inSquad} onClick={() => setIsPrivate(true)} />
            </div>
            <div className="mt-3 flex flex-col gap-2 @[26rem]:flex-row @[26rem]:items-stretch">
              <Input
                value={effectiveName}
                maxLength={LOBBY_NAME_MAX_LENGTH}
                placeholder="Name your squad…"
                tone="gold"
                className="flex-1"
                disabled={inSquad}
                onChange={(e) => {
                  setEdited(true);
                  setName(e.target.value);
                }}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
              <Button
                variant="goldCta"
                size="lg"
                className="shrink-0 justify-center gap-2 px-6 disabled:cursor-not-allowed"
                disabled={inSquad || !trimmedName || nameTaken}
                onClick={create}
              >
                <Skull size={16} aria-hidden="true" />
                Create
              </Button>
            </div>
            {!inSquad && nameTaken && (
              <p className="mt-1.5 text-xs text-negative">That name is already taken — pick another.</p>
            )}
          </section>

          {/* Join by code */}
          <section className="rounded-2xl border border-white/10 bg-black/15 p-3.5">
            <SectionLabel>Have a code?</SectionLabel>
            <div className="mt-2.5 flex flex-col gap-2 @[26rem]:flex-row @[26rem]:items-stretch">
              <div className="relative flex-1">
                <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                <Input
                  value={code}
                  maxLength={ZOMBIE_LOBBY_CODE_LENGTH}
                  placeholder="SQUAD CODE"
                  tone="gold"
                  className="w-full pl-9 text-center font-mono uppercase tracking-[0.4em]"
                  disabled={inSquad}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && joinByCode()}
                />
              </div>
              <Button
                variant="goldOutline"
                size="lg"
                className="shrink-0 justify-center px-6 disabled:cursor-not-allowed"
                disabled={inSquad || !code.trim()}
                onClick={joinByCode}
              >
                Join
              </Button>
            </div>
          </section>

          {/* Browser */}
          <section className="flex min-h-0 flex-col">
            <SectionLabel className="mb-2.5">Open squads · {visible.length}</SectionLabel>

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
                    <SquadCard
                      key={lobby.id}
                      lobby={lobby}
                      mine={mine}
                      // In a squad → only your own card is interactive (opens the
                      // queue); the rest are locked so you can't join a second.
                      locked={inSquad && !mine}
                      onSelect={() => {
                        setError(null);
                        if (mine) openQueue(true);
                        else sendZombieJoinLobby(lobby.id);
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

/** Roster pips: filled for taken seats; empty ones breathe (staggered) as "waiting". */
function SquadPips({ filled, capacity }: { filled: number; capacity: number }) {
  const color = STAT_COLORS.positive;
  let emptyIdx = 0;
  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: capacity }, (_, i) => {
        const occupied = i < filled;
        const delay = occupied ? 0 : emptyIdx++ * 0.18;
        return (
          <span
            key={i}
            className={'h-2.5 w-2.5 rounded-full ' + (occupied ? '' : 'animate-[slot-wait_1.4s_ease-in-out_infinite]')}
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

/** A public/private visibility tile — icon + label + hint, gold when active. */
function VisTile({
  icon: Icon,
  label,
  hint,
  active,
  disabled,
  onClick,
}: {
  icon: typeof Globe;
  label: string;
  hint: string;
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
        'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ' +
        (active
          ? 'border-gold bg-gold/15 text-gold shadow-[inset_0_0_18px_rgba(200,162,74,0.18)]'
          : 'border-white/10 bg-black/20 text-text enabled:hover:border-white/30 enabled:hover:bg-black/30')
      }
    >
      <Icon size={18} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">{label}</span>
        <span className={'block text-[11px] leading-tight ' + (active ? 'text-gold/70' : 'text-muted')}>{hint}</span>
      </span>
    </button>
  );
}

/** A browsable squad as a tactile card: name, roster pips, status, join chevron.
 *  `mine` flags your own squad (gold ring + badge, opens the queue); `locked` greys
 *  out others while you're in one. Disabled when full. */
function SquadCard({
  lobby,
  mine,
  locked,
  onSelect,
}: {
  lobby: ZombieLobbyView;
  mine: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  const filled = lobby.members.length;
  const full = filled >= ZOMBIE_COOP_MAX_PLAYERS;
  // Your own card always opens; otherwise it must have room AND not be locked.
  const interactive = mine || (!full && !locked);
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
            Co-op
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold text-text">{lobby.name}</span>
          {mine ? (
            <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
              Your squad
            </span>
          ) : (
            <span className={'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ' + (full ? 'text-muted' : 'text-positive')}>
              <Circle size={7} className="fill-current" aria-hidden="true" />
              {full ? 'Full' : 'Open'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SquadPips filled={filled} capacity={ZOMBIE_COOP_MAX_PLAYERS} />
          <span className="ml-auto flex items-center gap-1 text-xs tabular-nums text-muted">
            {filled}/{ZOMBIE_COOP_MAX_PLAYERS}
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

function EmptyState() {
  return (
    <div className="flex items-center justify-center gap-2.5 rounded-xl bg-black/15 px-4 py-6 text-center">
      <Skull size={16} className="shrink-0 text-muted/60" aria-hidden="true" />
      <p className="text-sm text-muted">No open squads yet — raise one or join a friend by code.</p>
    </div>
  );
}
