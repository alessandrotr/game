import { Ghost, LogOut, Skull, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../store/useAuthStore';
import { useUpgradeStore } from '../store/useUpgradeStore';
import { Button } from './primitives';

/**
 * The player's account card for the character-select screen — a glassy chip with
 * an avatar medallion, name, and the session actions.
 *
 * Guests read as "temporary": an amber ghost medallion and a "Progress not saved"
 * warning that nudges toward the gold **Save progress** CTA (guest → account
 * upgrade). A signed-in account instead shows the player's actual career — total
 * kills and wins across all classes — which is the only account info worth a glance
 * on a fighter select. Lives in the shared menu header (right side); renders
 * nothing until there's a session.
 */
export function AccountChip() {
  const username = useAuthStore((s) => s.username);
  const guest = useAuthStore((s) => s.guest);
  const signOut = useAuthStore((s) => s.signOut);
  const progress = useAuthStore((s) => s.progress);
  const openUpgrade = useUpgradeStore((s) => s.setOpen);

  const kills = progress.reduce((n, p) => n + p.kills, 0);
  const wins = progress.reduce((n, p) => n + p.wins, 0);
  const hasRecord = kills > 0 || wins > 0;
  const initial = (username ?? 'G').charAt(0).toUpperCase();

  // Nothing to show before a session exists (e.g. the login screen, which shares
  // this header) — only render once signed in or playing as a guest.
  if (!username && !guest) return null;

  return (
    <div
      className={cn(
        'border-white/12 flex max-w-full items-center gap-2.5 rounded-2xl border bg-panel/80 py-1.5 pl-2 pr-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.5)] backdrop-blur-md',
      )}
    >
      {/* Avatar medallion — a faceted gem-lit disc; amber ghost for guests, the
          account initial in gold for members. */}
      <div className="shrink-0">
        <div
          className={cn(
            'grid h-11 w-11 place-items-center rounded-full border font-display text-base font-semibold',
            guest ? 'border-amber-400/40 text-amber-300' : 'border-gold/50 text-gold',
          )}
          style={{
            background: `radial-gradient(circle at 30% 25%, ${
              guest ? 'rgba(251,191,36,0.22)' : 'rgba(200,162,74,0.22)'
            }, rgba(10,12,20,0.92) 72%)`,
          }}
        >
          {guest ? <Ghost size={20} aria-hidden="true" /> : initial}
        </div>
      </div>

      {/* Name + a line that actually means something: guests get the unsaved
          warning; members get their lifetime kills / wins (or a "new" tag). */}
      <div className="flex min-w-0 flex-col">
        <span className="truncate max-w-20 text-sm font-semibold leading-tight tracking-wide text-text">
          {guest ? 'Guest' : username}
        </span>
        {guest ? (
          <span className="mt-0.5 flex items-center gap-1.5 text-[8px] uppercase tracking-[0.18em] text-amber-300/90">
            Progress not saved
          </span>
        ) : hasRecord ? (
          <span className="mt-0.5 flex items-center gap-3 text-[11px] tabular-nums text-muted">
            <span className="flex items-center gap-1" title="Total kills">
              <Skull size={12} aria-hidden="true" className="text-gold/70" />
              {kills}
            </span>
            <span className="flex items-center gap-1" title="Total wins">
              <Trophy size={12} aria-hidden="true" className="text-gold/70" />
              {wins}
            </span>
          </span>
        ) : (
          <span className="mt-0.5 text-[8px] uppercase tracking-[0.18em] text-muted">
            New challenger
          </span>
        )}
      </div>

      {/* Actions: guests get the prominent save CTA; everyone gets a quiet
          exit/sign-out icon that warms to red on hover. */}
      <div className="ml-1 flex items-center gap-1.5">
        {guest && (
          <Button
            variant="gold"
            size="sm"
            onClick={() => openUpgrade(true)}
            className="gap-1.5 whitespace-nowrap"
          >
            Save progress
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={signOut}
          aria-label={guest ? 'Exit to title' : 'Sign out'}
          title={guest ? 'Exit' : 'Sign out'}
          className="h-8 w-8 rounded-lg hover:bg-white/8 hover:text-negative"
        >
          <LogOut size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
