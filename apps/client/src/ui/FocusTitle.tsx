import { useFocusStore, type FocusPanel } from '../store/useFocusStore';
import { PvpStats, CoopStats } from './FocusStats';

/** A short kicker above the title, per focused structure. */
const KICKER: Record<FocusPanel, string> = {
  leaderboard: 'Hall of Champions',
  pvp: 'Player Duels',
  coop: 'Co-op Survival',
};

/** A punchy, hooking one-liner under the title — what this is, fast. */
const BLURB: Record<FocusPanel, string> = {
  leaderboard: 'The realm’s deadliest, ranked. Stack wins, climb the board, and carve your name in gold.',
  pvp: 'Step onto the sand. Duel 1v1 or squad up for team fights where pure skill decides who walks away.',
  coop: 'Rally your party and hold the line as endless undead pour through the rift. How long can you last?',
};

/**
 * The big section title shown while a town structure is cinematically focused (see
 * useFocusStore). The structure's own 3D floating label is hidden in that mode; this
 * is its screen-space replacement — large, modern type docked to the left, over the
 * framed subject, while the panel sits on the right. Pointer-transparent, so clicks
 * still reach the close-on-backdrop overlay behind it.
 */
export function FocusTitle() {
  const title = useFocusStore((s) => s.title);
  const panel = useFocusStore((s) => s.panel);
  const active = useFocusStore((s) => !!s.target);
  if (!active || !title || !panel) return null;

  return (
    <div className="pointer-events-none fixed inset-y-0 left-0 z-modal flex w-1/2 flex-col justify-center bg-linear-to-r from-bg via-bg/65 to-transparent pl-8 sm:pl-14">
      <div className="animate-[focusTitleIn_360ms_cubic-bezier(0.16,1,0.3,1)_both]">
        <div className="mb-3 flex items-center gap-3">
          <span className="h-px w-10 bg-linear-to-r from-gold to-transparent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gold/90">
            {KICKER[panel]}
          </span>
        </div>
        <h2 className="font-display text-5xl font-black leading-[0.95] tracking-tight text-text drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)] sm:text-6xl lg:text-7xl">
          {title}
        </h2>
        <p className="mt-4 max-w-md text-base leading-relaxed text-text/85 [text-shadow:0_1px_10px_rgba(0,0,0,0.7)] sm:text-lg">
          {BLURB[panel]}
        </p>
        {panel === 'pvp' && <PvpStats />}
        {panel === 'coop' && <CoopStats />}
      </div>

      {/* Local keyframes — a quick rise + fade so the title feels like it lands with
          the camera, not a static label. */}
      <style>{`
        @keyframes focusTitleIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
