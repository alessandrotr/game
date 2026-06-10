import { useState, type FormEvent } from 'react';
import { getClassDefinition } from '@arena/shared';
import { connectToRoom } from '../network/colyseus';
import { useGameStore } from '../store/useGameStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { CharacterSelect } from './CharacterSelect';
import { ClassPreview } from './ClassPreview';

/** Difficulty pips (UO-flavored). */
function Difficulty({ level }: { level: number }) {
  return (
    <span className="text-xs tracking-[3px] text-gold">
      {'◆'.repeat(level)}
      <span className="text-white/20">{'◆'.repeat(3 - level)}</span>
    </span>
  );
}

/** Modern, Ultima-flavored character-select screen with a rotatable 3D model. */
export function JoinScreen() {
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);
  const selectedClass = useCharacterStore((s) => s.selectedClass);
  const [name, setName] = useState('');

  const connecting = status === 'connecting';
  const def = getClassDefinition(selectedClass);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (connecting) return;
    // Players enter the shared town hub first; portals lead to the arena.
    void connectToRoom('town', name.trim() || 'Adventurer', selectedClass).catch(() => {
      /* status/error already recorded in the store */
    });
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(circle_at_50%_22%,#191b2c,#07080d_72%)]">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-7">
        <header className="mb-6 text-center">
          <h1 className="font-display text-4xl tracking-[0.35em] text-gold drop-shadow-[0_2px_12px_rgba(200,162,74,0.35)] sm:text-5xl">
            ARENA
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.4em] text-muted">
            Choose your champion · enter the town
          </p>
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
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name…"
                maxLength={24}
                aria-label="Display name"
                className="rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-[15px] outline-none transition focus:border-gold"
              />
              <button
                type="submit"
                disabled={connecting}
                className="font-display rounded-xl border border-gold/60 bg-gradient-to-b from-gold to-[#9c7a2c] px-4 py-3 text-base font-semibold tracking-[0.15em] text-black shadow-[0_8px_24px_rgba(200,162,74,0.25)] transition hover:brightness-110 disabled:cursor-progress disabled:opacity-60"
              >
                {connecting ? 'ENTERING…' : 'ENTER THE WORLD'}
              </button>
              {error && <div className="text-center text-[13px] text-red-400">{error}</div>}
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
