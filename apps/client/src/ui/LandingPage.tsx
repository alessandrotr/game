import { Swords, TrendingUp, Trophy, Users, type LucideIcon } from 'lucide-react';
import { Button, Card } from './primitives';
import { ScreenHeader } from './ScreenHeader';
import { ClassCarousel } from './ClassCarousel';

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: Swords,
    title: 'QWER Combat',
    body: 'MOBA-style skillshots and abilities bound to Q · W · E · R. Aim, dodge, and burst your rival down.',
  },
  {
    icon: TrendingUp,
    title: 'Level Every Class',
    body: 'Each champion levels on its own track. Your progress is saved to your account across every session.',
  },
  {
    icon: Trophy,
    title: '1v1 Ranked',
    body: 'Queue for a duel, race to five kills, and climb the global leaderboard of wins, kills, and deaths.',
  },
  {
    icon: Users,
    title: 'Social Town Hub',
    body: 'Gather with other players in a shared town, chat with speech bubbles, and step through the moongate to fight.',
  },
];

/**
 * Presentational landing page shown to logged-out visitors before the auth form.
 * Explains the game, showcases the classes in a 3D carousel, and routes to login
 * via the `onPlay` CTA. Exactly one WebGL canvas (inside ClassCarousel).
 */
export function LandingPage({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="absolute inset-0 overflow-y-auto bg-arena-radial">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-5 py-16 sm:py-20">
        {/* Hero */}
        <section className="flex flex-col items-center text-center">
          <ScreenHeader subtitle="A real-time browser MOBA arena" titleClassName="text-6xl sm:text-7xl" />
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
            Pick a champion, master twitch QWER combat, and climb the ranked ladder — right in your
            browser, no download required.
          </p>
          <Button
            variant="gold"
            size="lg"
            onClick={onPlay}
            className="mt-9 px-10 tracking-[0.2em]"
          >
            LOG IN &amp; PLAY
          </Button>
        </section>

        {/* Class carousel */}
        <section>
          <h2 className="mb-7 text-center font-display text-2xl tracking-[0.2em] text-gold">
            Choose your champion
          </h2>
          <ClassCarousel />
        </section>

        {/* Features */}
        <section>
          <h2 className="mb-7 text-center font-display text-2xl tracking-[0.2em] text-gold">
            How it plays
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <Card key={f.title} variant="inset" className="flex items-start gap-4">
                <f.icon className="mt-0.5 shrink-0 text-gold" size={26} aria-hidden="true" />
                <div>
                  <h3 className="font-display text-lg tracking-wide text-text">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{f.body}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="flex flex-col items-center text-center">
          <h2 className="font-display text-3xl tracking-wider text-gold">Ready to fight?</h2>
          <p className="mt-3 max-w-md text-sm text-muted">
            Create a free account, level your classes, and enter the arena.
          </p>
          <Button
            variant="gold"
            size="lg"
            onClick={onPlay}
            className="mt-7 px-10 tracking-[0.2em]"
          >
            LOG IN &amp; PLAY
          </Button>
        </section>
      </div>
    </div>
  );
}
