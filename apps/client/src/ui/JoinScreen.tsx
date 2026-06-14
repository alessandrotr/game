import { type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { classCosmeticsOf } from '@arena/shared';
import { connectToRoom } from '../network/colyseus';
import { useGameStore } from '../store/useGameStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useCosmeticsStore } from '../store/useCosmeticsStore';
import { useAuthStore } from '../store/useAuthStore';
import { useUpgradeStore } from '../store/useUpgradeStore';
import { AudioControl } from './AudioControl';
import { CharacterSelect } from './CharacterSelect';
import { ClassPreview } from './ClassPreview';
import { Button } from './primitives';
import { UpgradeAccountDialog } from './UpgradeAccountDialog';

/** Modern, Ultima-flavored character-select screen with a rotatable 3D model. */
export function JoinScreen() {
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);
  const selectedClass = useCharacterStore((s) => s.selectedClass);
  const username = useAuthStore((s) => s.username);
  const guest = useAuthStore((s) => s.guest);
  const signOut = useAuthStore((s) => s.signOut);
  const openUpgrade = useUpgradeStore((s) => s.setOpen);

  const connecting = status === 'connecting';
  // Reflect the selected class's equipped look (skin / dye / pedestal).
  const byClass = useCosmeticsStore((s) => s.byClass);
  const loadout = classCosmeticsOf(byClass, selectedClass).loadout;

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
      {/* Full-width, full-height 3D space, stacked as a column: the model area
          grows to fill whatever is left above the bottom panel, so the model is
          always framed in clear space and never sits underneath the UI. */}
      <section className="flex h-dvh w-full flex-col bg-[#0a0b12]">
        {/* Model area — full width, takes all space above the panel. */}
        <div className="relative min-h-0 flex-1">
          <ClassPreview
            characterClass={selectedClass}
            skinId={loadout.skinId}
            dyeId={loadout.dyeId}
            pedestalId={loadout.pedestalId}
            align="top"
          />

          {/* Top bar: wordmark + account controls, overlaid on the model area. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 sm:p-5">
            <div className="pointer-events-auto">
              <h1 className="font-display text-2xl tracking-[0.35em] indent-[0.35em] text-gold drop-shadow-[0_2px_12px_rgba(200,162,74,0.4)] sm:text-3xl">
                ARENA
              </h1>
            </div>
            <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 text-xs text-muted">
              <AudioControl />
              <span className="hidden sm:inline">
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
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 text-center text-[10px] uppercase tracking-[0.2em] text-white/40">
            drag to rotate · scroll to zoom
          </div>
        </div>

        {/* Bottom panel — selection + entry. Capped so the model keeps its room;
            the selection scrolls internally, ENTER stays pinned below it. */}
        <div className="z-20 flex shrink-0 justify-center">
          <div className="w-full max-w-2xl overflow-hidden rounded-t-2xl border border-b-0 border-white/10 bg-panel/90 shadow-[0_-20px_60px_rgba(0,0,0,0.5)] backdrop-blur-md">
            {/* Selection — scrolls whenever it's taller than this cap. */}
            <div className="max-h-[46dvh] overflow-y-auto px-4 py-4 sm:px-5">
              <CharacterSelect />
            </div>

            {/* Entry — pinned below the scroll area so it's always reachable. */}
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
        </div>
      </section>

      {guest && <UpgradeAccountDialog />}
    </div>
  );
}
