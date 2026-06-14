import { type FormEvent } from 'react';
import { Diamond, Loader2 } from 'lucide-react';
import { classCosmeticsOf, getClassDefinition } from '@arena/shared';
import { connectToRoom } from '../network/colyseus';
import { useGameStore } from '../store/useGameStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useCosmeticsStore } from '../store/useCosmeticsStore';
import { useAuthStore } from '../store/useAuthStore';
import { useUpgradeStore } from '../store/useUpgradeStore';
import { AudioControl } from './AudioControl';
import { CharacterSelect } from './CharacterSelect';
import { ClassPreview } from './ClassPreview';
import { Button, LevelBadge } from './primitives';
import { UpgradeAccountDialog } from './UpgradeAccountDialog';

/** Difficulty pips (UO-flavored). */
function Difficulty({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`Difficulty ${level} of 3`}>
      {[0, 1, 2].map((i) => (
        <Diamond
          key={i}
          size={12}
          aria-hidden="true"
          className={i < level ? 'fill-gold text-gold' : 'text-white/20'}
        />
      ))}
    </span>
  );
}

/** Modern, Ultima-flavored character-select screen with a rotatable 3D model. */
export function JoinScreen() {
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);
  const selectedClass = useCharacterStore((s) => s.selectedClass);
  const username = useAuthStore((s) => s.username);
  const guest = useAuthStore((s) => s.guest);
  const signOut = useAuthStore((s) => s.signOut);
  const progress = useAuthStore((s) => s.progress);
  const openUpgrade = useUpgradeStore((s) => s.setOpen);

  const connecting = status === 'connecting';
  const def = getClassDefinition(selectedClass);
  // Account's level on the selected class (unplayed classes default to 1).
  const level = progress.find((p) => p.characterClass === selectedClass)?.level ?? 1;
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
      {/* Full-width, full-height 3D space. The model is framed small and high so
          every piece of UI can overlay it: account controls up top, the class
          identity + selection + entry in a panel pinned to the bottom. */}
      <section className="relative h-dvh w-full overflow-hidden bg-[#0a0b12]">
        <ClassPreview
          characterClass={selectedClass}
          skinId={loadout.skinId}
          dyeId={loadout.dyeId}
          pedestalId={loadout.pedestalId}
          align="top"
        />

        {/* Top bar: wordmark + account controls, overlaid on the scene. */}
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

        <div className="pointer-events-none absolute right-4 top-20 z-20 rounded-full bg-black/30 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white/45 backdrop-blur-sm">
          drag to rotate · scroll to zoom
        </div>

        {/* Bottom panel — class identity, selection, and entry, overlaid on the
            lower half of the scene. Scrolls internally on short / mobile screens
            while the model stays framed above; ENTER stays pinned at the bottom. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex max-h-[70dvh] justify-center">
          <div className="pointer-events-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-b-0 border-white/10 bg-panel/85 shadow-[0_-20px_60px_rgba(0,0,0,0.5)] backdrop-blur-md">
            {/* Identity header — frame accent tracks the selected class color. */}
            <div
              className="flex items-end justify-between gap-3 border-b border-white/10 px-5 py-3"
              style={{ background: `linear-gradient(to bottom, ${def.color}1a, transparent)` }}
            >
              <div className="flex min-w-0 items-center gap-4">
                <LevelBadge level={level} size="lg" />
                <div className="min-w-0">
                  <h2
                    className="font-display text-2xl leading-none tracking-wider drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                    style={{ color: def.color }}
                  >
                    {def.name}
                  </h2>
                  <p className="mt-1.5 text-sm text-muted">{def.role}</p>
                </div>
              </div>
              <Difficulty level={def.stats.difficulty} />
            </div>

            {/* Selection — scrolls if it overflows the capped panel height. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
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
