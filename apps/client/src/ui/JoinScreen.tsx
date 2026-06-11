import { type FormEvent } from 'react';
import { Diamond } from 'lucide-react';
import { getClassDefinition } from '@arena/shared';
import { connectToRoom } from '../network/colyseus';
import { useGameStore } from '../store/useGameStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useAuthStore } from '../store/useAuthStore';
import { CharacterSelect } from './CharacterSelect';
import { ClassPreview } from './ClassPreview';
import { Button } from './primitives';

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
  const signOut = useAuthStore((s) => s.signOut);

  const connecting = status === 'connecting';
  const def = getClassDefinition(selectedClass);

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
    <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(circle_at_50%_22%,#191b2c,#07080d_72%)]">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-7">
        <header className="relative mb-6 text-center">
          <h1 className="font-display text-4xl tracking-[0.35em] text-gold drop-shadow-[0_2px_12px_rgba(200,162,74,0.35)] sm:text-5xl">
            ARENA
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.4em] text-muted">
            Choose your champion · enter the town
          </p>
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted sm:absolute sm:right-0 sm:top-1 sm:mt-0">
            <span>
              Signed in as <span className="font-semibold text-text">{username}</span>
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
          {/* 3D model showcase */}
          <section className="relative min-h-[42vh] overflow-hidden rounded-2xl border border-gold/25 bg-black/40 shadow-[0_20px_60px_rgba(0,0,0,0.5)] lg:min-h-0">
            <ClassPreview />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-3xl tracking-wider" style={{ color: def.color }}>
                    {def.name}
                  </h2>
                  <p className="text-sm text-muted">{def.role}</p>
                </div>
                <Difficulty level={def.stats.difficulty} />
              </div>
            </div>
            <div className="pointer-events-none absolute right-4 top-4 text-[10px] uppercase tracking-[0.2em] text-white/35">
              drag to rotate · scroll to zoom
            </div>
          </section>

          {/* Selection + entry */}
          <section className="flex flex-col gap-4">
            <CharacterSelect />

            <form onSubmit={onSubmit} className="mt-auto flex flex-col gap-3">
              <Button type="submit" variant="gold" size="lg" disabled={connecting} className="tracking-[0.15em]">
                {connecting ? 'ENTERING…' : 'ENTER THE WORLD'}
              </Button>
              {error && (
                <div role="alert" className="text-center text-[13px] text-red-400">
                  {error}
                </div>
              )}
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
