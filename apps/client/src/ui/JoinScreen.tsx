import { type FormEvent } from 'react';
import { Diamond, Loader2 } from 'lucide-react';
import { classCosmeticsOf, getClassDefinition, getCosmeticOfType } from '@arena/shared';
import { connectToRoom } from '../network/colyseus';
import { useGameStore } from '../store/useGameStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useCosmeticsStore } from '../store/useCosmeticsStore';
import { useAuthStore } from '../store/useAuthStore';
import { useUpgradeStore } from '../store/useUpgradeStore';
import { TownBackdrop } from '../scene/TownBackdrop';
import { AudioControl } from './AudioControl';
import { CharacterSelect } from './CharacterSelect';
import { ClassPreview } from './ClassPreview';
import { Button, LevelBadge } from './primitives';
import { ScreenHeader } from './ScreenHeader';
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
  const pedestalColor = loadout.pedestalId
    ? getCosmeticOfType(loadout.pedestalId, 'pedestal')?.color
    : undefined;

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
    <div className="absolute inset-0 overflow-y-auto">
      <TownBackdrop />
      {/* Scrim over the live scene so the select UI stays legible. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/65" />

      <div className="relative mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-7">
        <ScreenHeader
          className="relative mb-6"
          titleClassName="text-4xl sm:text-5xl"
          subtitle="Choose your champion · enter the town"
        >
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted sm:absolute sm:right-0 sm:top-1 sm:mt-0">
            <AudioControl />
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
        </ScreenHeader>

        <div className="grid flex-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
          {/* 3D model showcase — its frame + glow track the selected class color,
              so the hero, the chosen card, and the name read as one identity. */}
          <section className="relative min-h-[42vh] overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-[0_20px_60px_rgba(0,0,0,0.45)] lg:min-h-0">
            <ClassPreview
              characterClass={selectedClass}
              skinId={loadout.skinId}
              dyeId={loadout.dyeId}
              pedestalColor={pedestalColor}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-5">
              <div className="flex items-end justify-between gap-3">
                <div className="flex min-w-0 items-center gap-6">
                  <LevelBadge level={level} size="lg" />
                  <div className="min-w-0">
                    <h2
                      className="font-display text-3xl leading-none tracking-wider drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                      style={{ color: def.color }}
                    >
                      {def.name}
                    </h2>
                    <span
                      className="mt-2 block h-0.5 w-10 rounded-full"
                      style={{ background: def.color }}
                    />
                    <p className="mt-2 text-sm text-muted">{def.role}</p>
                  </div>
                </div>
                <Difficulty level={def.stats.difficulty} />
              </div>
            </div>
            <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-black/30 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white/45 backdrop-blur-sm">
              drag to rotate · scroll to zoom
            </div>
          </section>

          {/* Selection + entry */}
          <section className="flex flex-col gap-4">
            <CharacterSelect />

            <form onSubmit={onSubmit} className="flex flex-col gap-2">
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
          </section>
        </div>
      </div>

      {guest && <UpgradeAccountDialog />}
    </div>
  );
}
