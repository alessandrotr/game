import { LogOut, Skull, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../store/useAuthStore';
import { useUpgradeStore } from '../store/useUpgradeStore';
import { Button } from './primitives';

/**
 * The player's account card for the character-select screen — a glassy chip with
 * the name and the session actions.
 *
 * Guests read as "temporary": a "Guest" name and a **Save progress** CTA that nudges
 * toward the guest → account upgrade. A signed-in account instead shows the player's actual career — total
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

  // Nothing to show before a session exists (e.g. the login screen, which shares
  // this header) — only render once signed in or playing as a guest.
  if (!username && !guest) return null;

  return (
    <div
      className={cn(
        'border-white/12 flex max-w-full items-center gap-2.5 rounded-2xl border bg-panel/80 py-2 px-3 shadow-[0_12px_30px_rgba(0,0,0,0.5)] backdrop-blur-md',
      )}
    >
      {/* Name + a line that actually means something: guests get the unsaved
          warning; members get their lifetime kills / wins (or a "new" tag). */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate max-w-20 text-sm font-semibold leading-tight tracking-wide text-text">
          {guest ? 'Guest' : username}
        </span>
        {guest ? (
          <Button
            variant="gold"
            size="sm"
            onClick={() => openUpgrade(true)}
            className="whitespace-nowrap"
          >
            Save progress
          </Button>
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
  );
}
