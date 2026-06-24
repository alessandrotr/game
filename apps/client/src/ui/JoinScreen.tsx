import { type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { connectToRoom } from '../network/colyseus';
import { useGameStore } from '../store/useGameStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useAuthStore } from '../store/useAuthStore';
import { CharacterSelect } from './CharacterSelect';
import { MenuHeader } from './MenuHeader';
import { AccountChip } from './AccountChip';
import { Button } from './primitives';
import { UpgradeAccountDialog } from './UpgradeAccountDialog';

/** Character-select screen: a full-width panel of class cards (each a live 3D
 *  portrait of that class in its equipped cosmetics) over the town backdrop. */
export function JoinScreen() {
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);
  const selectedClass = useCharacterStore((s) => s.selectedClass);
  const guest = useAuthStore((s) => s.guest);

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

      {/* The fighter-select stage — a wide cinematic panel (the featured fighter
          on the left, the roster grid on the right). Centered for the marquee
          feel; the account controls sit above it. */}
      <section className="relative flex h-dvh w-full flex-col items-center justify-center gap-3 px-3 py-6 sm:px-8">
        <div className="flex w-full max-w-4xl items-center justify-end">
          <AccountChip />
        </div>

        <div className="flex max-h-[calc(100dvh-7rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-panel/90 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-md">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-5">
            <div className="w-full">
              <CharacterSelect />
            </div>
          </div>
          <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-white/10 p-4">
            <Button
              type="submit"
              variant="goldCta"
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
