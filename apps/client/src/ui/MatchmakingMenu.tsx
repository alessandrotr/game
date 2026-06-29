import { Swords } from 'lucide-react';
import { LOBBY_MODES, teamSizeForMode, type LobbyMode } from '@arena/shared';
import {
  capacityForMode,
  countForMode,
  myQueueMode,
  useQueueStore,
} from '../store/useQueueStore';
import { findMyZombieLobby, useZombieLobbyStore } from '../store/useZombieLobbyStore';
import { useFocusStore } from '../store/useFocusStore';
import { sendJoinQueue, sendLeaveQueue } from '../network/colyseus';
import { Overlay } from './primitives';

/** Per-format role word shown beside the size on each blade. */
const FORMAT_ROLE: Record<number, string> = { 1: 'Solo', 2: 'Duo', 3: 'Trio', 4: 'Squad', 5: 'Team' };

/**
 * The matchmaking panel: a stack of EPIC one-click format blades. Pick a format
 * and you join that queue immediately (the blade lights gold + tracks fill; the
 * match starts the moment it's ready). Clicking your active format leaves the
 * queue. The format blades are the whole UI — no chrome, no title — so the choice
 * is the only thing on screen. Docks right during the shrine's cinematic focus
 * (see scene/TownDuelAltar.tsx).
 */
export function MatchmakingMenu() {
  const members = useQueueStore((s) => s.members);
  const mySessionId = useQueueStore((s) => s.mySessionId);
  const error = useQueueStore((s) => s.error);
  const setMenuOpen = useQueueStore((s) => s.setMenuOpen);
  const docked = useFocusStore((s) => s.panel === 'pvp' && !!s.target);

  const myMode = myQueueMode(members, mySessionId);
  // One match at a time across modes: being tied up in a co-op zombie squad blocks
  // PvP queueing.
  const inCoop = !!findMyZombieLobby(
    useZombieLobbyStore((s) => s.lobbies),
    useZombieLobbyStore((s) => s.mySessionId),
  );

  const pick = (mode: LobbyMode) => {
    if (inCoop) return;
    if (myMode === mode) sendLeaveQueue();
    else sendJoinQueue(mode);
  };

  return (
    <Overlay
      onClose={() => setMenuOpen(false)}
      closeOnEscape
      dock={docked ? 'right' : 'center'}
      transparent={docked}
    >
      <div className={`flex flex-col gap-2.5 ${docked ? 'w-[clamp(24rem,30vw,32rem)] pr-2' : 'w-[min(420px,92vw)]'}`}>
        {LOBBY_MODES.map((m, i) => (
          <ModeBlade
            key={m}
            mode={m}
            index={i}
            queued={myMode === m}
            count={countForMode(members, m)}
            capacity={capacityForMode(m)}
            disabled={inCoop}
            onClick={() => pick(m)}
          />
        ))}
        {inCoop && (
          <p className="blade-rise px-1 pt-1 text-center text-[11px] font-medium text-muted" style={{ animationDelay: '0.3s' }}>
            Leave your co-op squad to enter a trial.
          </p>
        )}
        {error && (
          <p className="blade-rise px-1 text-center text-[11px] font-semibold text-negative">{error}</p>
        )}
      </div>
    </Overlay>
  );
}

/**
 * A single format blade. The size reads huge; a cluster of sword pips makes the
 * team scale instantly legible; the right edge carries the live state (open /
 * waiting / queued). Hover sweeps a sheen + lifts; queued lights a breathing gold
 * frame. Rises in with a per-row stagger when the panel opens.
 */
function ModeBlade({
  mode,
  index,
  queued,
  count,
  capacity,
  disabled,
  onClick,
}: {
  mode: LobbyMode;
  index: number;
  queued: boolean;
  count: number;
  capacity: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  const teamSize = teamSizeForMode(mode);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={queued}
      style={{ animationDelay: `${index * 0.06}s` }}
      className={
        'blade-rise group relative isolate flex h-[4.25rem] items-center gap-4 overflow-hidden rounded-2xl border px-5 text-left backdrop-blur-xl transition duration-200 disabled:cursor-not-allowed disabled:opacity-40 ' +
        (queued
          ? 'blade-glow border-gold/80 bg-gradient-to-r from-gold/25 via-gold/12 to-transparent'
          : 'border-white/12 bg-gradient-to-r from-white/[0.07] to-white/[0.02] shadow-[0_8px_28px_rgba(0,0,0,0.4)] enabled:hover:-translate-y-0.5 enabled:hover:border-gold/55 enabled:hover:shadow-[0_14px_36px_rgba(0,0,0,0.55)]')
      }
    >
      {/* Sheen band — sweeps across once on hover-in. */}
      <span className="blade-sheen-el pointer-events-none absolute inset-y-0 left-0 -z-10 w-2/5 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0" />

      {/* Left accent edge — brightens with state. */}
      <span
        className={
          'absolute inset-y-2.5 left-0 w-[3px] rounded-full transition ' +
          (queued ? 'bg-gold shadow-[0_0_12px_rgba(200,162,74,0.9)]' : 'bg-white/15 group-enabled:group-hover:bg-gold/70')
        }
      />

      {/* Pip cluster — one sword per team-side member; scale at a glance. */}
      <div className="flex shrink-0 items-center gap-0.5">
        {Array.from({ length: teamSize }).map((_, p) => (
          <Swords
            key={p}
            size={13}
            aria-hidden="true"
            className={queued ? 'text-gold' : 'text-muted/60 transition group-enabled:group-hover:text-gold/80'}
          />
        ))}
      </div>

      {/* Size + role. */}
      <div className="flex min-w-0 flex-col">
        <span
          className={
            'font-display text-[1.85rem] font-black leading-none tracking-wide ' +
            (queued ? 'text-gold' : 'text-text transition group-enabled:group-hover:text-white')
          }
        >
          {mode}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted/70">
          {FORMAT_ROLE[teamSize]}
        </span>
      </div>

      {/* Live state, hard-right. */}
      <div className="ml-auto flex shrink-0 flex-col items-end">
        {queued ? (
          <>
            <span className="flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wider text-gold">
              Queued
              <span className="flex gap-0.5">
                <span className="blade-dot h-1 w-1 rounded-full bg-gold" style={{ animationDelay: '0s' }} />
                <span className="blade-dot h-1 w-1 rounded-full bg-gold" style={{ animationDelay: '0.2s' }} />
                <span className="blade-dot h-1 w-1 rounded-full bg-gold" style={{ animationDelay: '0.4s' }} />
              </span>
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-gold/80">{count}/{capacity} ready</span>
          </>
        ) : count > 0 ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" />
            {count} waiting
          </span>
        ) : (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted/60 transition group-enabled:group-hover:border-gold/40 group-enabled:group-hover:text-gold/80">
            Enter
          </span>
        )}
      </div>
    </button>
  );
}
