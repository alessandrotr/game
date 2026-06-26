import { Swords, X } from 'lucide-react';
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
import { Card, Overlay } from './primitives';

/** Per-format role label shown under the size on each tile. */
const FORMAT_ROLE: Record<number, string> = { 1: 'Solo', 2: 'Duo', 3: 'Trio', 4: 'Squad', 5: 'Team' };

/**
 * The matchmaking panel, reworked to a one-click QUEUE: pick a FORMAT tile and you
 * join that format's queue immediately (the badge tracks fill + the match starts
 * the moment it's ready). Clicking your active format leaves the queue. Docks right
 * during the shrine's cinematic focus (see scene/TownDuelAltar.tsx).
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
    <Overlay onClose={() => setMenuOpen(false)} closeOnEscape dock={docked ? 'right' : 'center'} transparent={docked}>
      <Card
        variant="modal"
        style={{ containerType: 'inline-size' }}
        className={`flex flex-col overflow-hidden border-white/10 bg-panel/55 backdrop-blur-2xl ${docked ? 'w-[clamp(28rem,32vw,40rem)]' : 'w-[min(460px,94vw)]'}`}
      >
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

        <div className="flex flex-col gap-3 px-5 pb-5 pt-3">
          <SectionLabel>{inCoop ? 'Busy in a co-op squad' : myMode ? 'In queue — pick again to leave' : 'Choose a format to queue'}</SectionLabel>
          <div className="grid grid-cols-1 gap-2 @[24rem]:grid-cols-2">
            {LOBBY_MODES.map((m) => (
              <ModeTile
                key={m}
                mode={m}
                queued={myMode === m}
                count={countForMode(members, m)}
                capacity={capacityForMode(m)}
                disabled={inCoop}
                onClick={() => pick(m)}
              />
            ))}
          </div>
          {inCoop && <p className="text-xs text-muted">Leave your co-op squad to queue for a duel.</p>}
          {error && (
            <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </div>
          )}
        </div>
      </Card>
    </Overlay>
  );
}

/** A format tile: the size big, a role label + live queue fill under it. Lights
 *  gold while you're queued for it (click again to leave). */
function ModeTile({
  mode,
  queued,
  count,
  capacity,
  disabled,
  onClick,
}: {
  mode: LobbyMode;
  queued: boolean;
  count: number;
  capacity: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={queued}
      className={
        'flex flex-col items-center gap-0.5 rounded-xl border py-3 transition disabled:cursor-not-allowed disabled:opacity-40 ' +
        (queued
          ? 'border-gold bg-gold/15 text-gold shadow-[inset_0_0_18px_rgba(200,162,74,0.18)]'
          : 'border-white/10 bg-black/20 text-text enabled:hover:border-white/30 enabled:hover:bg-black/30')
      }
    >
      <span className="font-display text-xl font-black leading-none tracking-wide">{mode}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50">
        {FORMAT_ROLE[teamSizeForMode(mode)]}
      </span>
      {queued ? (
        <span className="mt-1 text-[11px] font-semibold tabular-nums text-gold/90">
          Queued · {count}/{capacity}
        </span>
      ) : count > 0 ? (
        <span className="mt-1 text-[11px] tabular-nums text-muted">{count} waiting</span>
      ) : null}
    </button>
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
