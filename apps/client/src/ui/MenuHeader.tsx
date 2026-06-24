import { AudioControl } from './AudioControl';
import { AccountChip } from './AccountChip';
import { OnlinePlayersCounter } from './OnlinePlayersCounter';

/**
 * The shared top bar for the pre-game menus (auth + character select): the ARENA
 * wordmark on the left; on the right the compact audio control and then the
 * account chip. Identical on both screens so the transition is seamless — the
 * account chip renders nothing until there's a session (so it's absent on login).
 *
 * On the auth screen (`showOnlineCount`) the live "playing now" line sits just
 * under the wordmark instead of inside the sign-in card.
 */
export function MenuHeader({ showOnlineCount = false }: { showOnlineCount?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-4 sm:p-5">
      <div className="pointer-events-auto">
        <h1 className="font-display text-2xl tracking-[0.35em] indent-[0.35em] text-gold drop-shadow-[0_2px_12px_rgba(200,162,74,0.4)] sm:text-3xl">
          ARENA
        </h1>
        {showOnlineCount && <OnlinePlayersCounter className="mt-2 justify-start pl-2.5" />}
      </div>
      <div className="pointer-events-auto flex items-center gap-3">
        <AudioControl compact />
        <AccountChip />
      </div>
    </div>
  );
}
