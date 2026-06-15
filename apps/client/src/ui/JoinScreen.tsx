import { type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { connectToRoom } from '../network/colyseus';
import { useGameStore } from '../store/useGameStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useAuthStore } from '../store/useAuthStore';
import { useUpgradeStore } from '../store/useUpgradeStore';
import { CharacterSelect } from './CharacterSelect';
import { MenuHeader } from './MenuHeader';
import { Button } from './primitives';
import { UpgradeAccountDialog } from './UpgradeAccountDialog';

/** Character-select screen: a full-width panel of class cards (each a live 3D
 *  portrait of that class in its equipped cosmetics) over the town backdrop. */
export function JoinScreen() {
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);
  const selectedClass = useCharacterStore((s) => s.selectedClass);
  const username = useAuthStore((s) => s.username);
  const guest = useAuthStore((s) => s.guest);
  const signOut = useAuthStore((s) => s.signOut);
  const openUpgrade = useUpgradeStore((s) => s.setOpen);

  const connecting = status === 'connecting';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (connecting) return;
    // Players enter the shared town hub first; portals lead to the arena. The
    // display name comes from the signed-in account (no name field here).
    void connectToRoom('town', selectedClass).catch(() => {
      /* status/error already recorded in the store */
    });
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* The live town backdrop is mounted by App (shared with the auth screen so
          the transition is seamless). Here we only darken it with a gradient (no
          blur, matching the auth screen) to keep the UI legible. */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/60 via-black/40 to-black/70" />

      <MenuHeader />

      {/* A single full-width selection panel (capped at max-w-xl); each class card
          carries its own live 3D portrait, so there's no separate big model. The
          account controls sit centered above the picker. */}
      <section className="relative flex h-dvh w-full flex-col items-center justify-center gap-3 px-4 pb-6 pt-20 sm:px-8">
        <div className="flex w-full max-w-xl flex-wrap items-center justify-end gap-2 text-xs text-muted">
          <span>
            {guest ? (
              'Playing as guest'
            ) : (
              <>
                Signed in as <span className="font-semibold text-text">{username}</span>
              </>
            )}
          </span>
          {guest && (
            <Button variant="gold" size="sm" onClick={() => openUpgrade(true)}>
              Save progress
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={signOut}>
            {guest ? 'Exit' : 'Sign out'}
          </Button>
        </div>

        <div className="flex max-h-[80dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-panel/90 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-md">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-5">
            <div className="w-full">
              <CharacterSelect />
            </div>
          </div>
          <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-white/10 p-4">
            <Button
              type="submit"
              variant="gold"
              size="lg"
              disabled={connecting}
              className="gap-2 tracking-[0.15em]"
            >
              {connecting && <Loader2 size={18} aria-hidden="true" className="animate-spin" />}
              {connecting ? 'ENTERING…' : 'ENTER THE WORLD'}
            </Button>
            {error && (
              <div role="alert" className="text-center text-[13px] text-negative">
                {error}
              </div>
            )}
          </form>
        </div>
      </section>

      {guest && <UpgradeAccountDialog />}
    </div>
  );
}
