import { useEffect, useState } from 'react';
import { Eye, LogOut, Skull } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { livingTeammates, useCoopStore } from '../store/useCoopStore';
import { travelTo } from '../network/colyseus';
import { Button, Card, Overlay } from './primitives';
import { STAT_COLORS } from './theme';

/** Seconds the defeat screen shows before auto-returning to town. */
const AUTO_RETURN_SECONDS = 8;

/**
 * Co-op zombie death flow (death is final). On the local player's death it offers
 * a choice — Spectate a teammate or return to town in defeat; while spectating it
 * shows a small banner with teammate cycling; and when the whole squad falls it
 * shows the defeat screen and returns to town. Self-gates: renders nothing outside
 * a co-op run. Detection runs off the replicated `alive` flag each snapshot.
 */
export function CoopOverlay() {
  const tick = useGameStore((s) => s.tick);
  const coop = useGameStore((s) => s.coopZombie);
  const sessionId = useGameStore((s) => s.sessionId);
  const phase = useCoopStore((s) => s.phase);
  const gameOver = useCoopStore((s) => s.gameOver);

  // Detect the local player's death each snapshot → prompt the choice once.
  useEffect(() => {
    if (!coop || !sessionId) return;
    const me = useGameStore.getState().players.get(sessionId);
    const st = useCoopStore.getState();
    if (me && !me.alive && st.phase === 'playing' && !st.gameOver) st.startChoosing();
  }, [tick, coop, sessionId]);

  if (gameOver) return <DefeatScreen level={gameOver.level} />;
  if (!coop) return null;
  if (phase === 'choosing') return <DeathChoice sessionId={sessionId} />;
  if (phase === 'spectating') return <SpectateBanner sessionId={sessionId} />;
  return null;
}

/** The "you have fallen" prompt: spectate a teammate, or quit to town in defeat. */
function DeathChoice({ sessionId }: { sessionId: string | null }) {
  const spectate = useCoopStore((s) => s.spectate);
  const mates = livingTeammates(useGameStore.getState().players, sessionId);
  const canSpectate = mates.length > 0;

  return (
    <Overlay closeOnBackdrop={false}>
      <Card variant="modal" className="w-[380px]">
        <div className="px-6 py-6 text-center">
          <div
            className="font-display text-2xl font-bold tracking-wide"
            style={{ color: STAT_COLORS.negative }}
          >
            You have fallen
          </div>
          <div className="mt-1 text-xs text-muted">
            There's no respawn in a co-op run. Watch your squad fight on, or fall back to town.
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <Button
              variant="gold"
              disabled={!canSpectate}
              className="w-full gap-1.5 px-5 py-2.5"
              onClick={() => spectate(mates[0]?.sessionId ?? null)}
            >
              <Eye size={15} aria-hidden="true" />
              {canSpectate ? 'Spectate squad' : 'No squadmates left'}
            </Button>
            <Button
              variant="goldOutline"
              className="w-full gap-1.5 px-5 py-2.5"
              onClick={() => void travelTo('town')}
            >
              <LogOut size={15} aria-hidden="true" />
              Return to town
            </Button>
          </div>
        </div>
      </Card>
    </Overlay>
  );
}

/** A small banner while spectating: who you're watching, prev/next, and quit. */
function SpectateBanner({ sessionId }: { sessionId: string | null }) {
  useGameStore((s) => s.tick); // re-evaluate as teammates move / fall
  const spectateTargetId = useCoopStore((s) => s.spectateTargetId);
  const setSpectateTarget = useCoopStore((s) => s.setSpectateTarget);

  const players = useGameStore.getState().players;
  const mates = livingTeammates(players, sessionId);

  // Keep the watched teammate valid as the roster thins.
  useEffect(() => {
    if (mates.length === 0) return;
    if (!spectateTargetId || !mates.some((m) => m.sessionId === spectateTargetId)) {
      setSpectateTarget(mates[0]!.sessionId);
    }
  });

  const current = mates.find((m) => m.sessionId === spectateTargetId) ?? mates[0];
  const cycle = (dir: 1 | -1) => {
    if (mates.length === 0) return;
    const i = Math.max(0, mates.findIndex((m) => m.sessionId === current?.sessionId));
    const next = mates[(i + dir + mates.length) % mates.length]!;
    setSpectateTarget(next.sessionId);
  };

  return (
    <div className="pointer-events-none fixed bottom-28 left-1/2 z-modal -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-black/70 px-4 py-2.5 backdrop-blur">
        <Skull size={15} className="text-negative" aria-hidden="true" />
        <span className="text-sm text-muted">
          Spectating <span className="font-semibold text-text">{current?.name ?? '—'}</span>
        </span>
        {mates.length > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="panel" size="sm" className="!px-2" onClick={() => cycle(-1)}>
              ◀
            </Button>
            <Button variant="panel" size="sm" className="!px-2" onClick={() => cycle(1)}>
              ▶
            </Button>
          </div>
        )}
        <Button
          variant="goldOutline"
          size="sm"
          className="gap-1.5 px-3"
          onClick={() => void travelTo('town')}
        >
          <LogOut size={13} aria-hidden="true" />
          Town
        </Button>
      </div>
    </div>
  );
}

/** The whole squad fell — defeat screen, auto-returns to town. */
function DefeatScreen({ level }: { level: number }) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RETURN_SECONDS);
  useEffect(() => {
    setSecondsLeft(AUTO_RETURN_SECONDS);
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          void travelTo('town');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Overlay closeOnBackdrop={false}>
      <Card variant="modal" className="w-[400px]">
        <div
          className="px-6 py-6 text-center"
          style={{
            background: `linear-gradient(180deg, color-mix(in srgb, ${STAT_COLORS.negative} 13%, transparent), transparent)`,
          }}
        >
          <div
            className="font-display text-3xl font-bold tracking-wide"
            style={{
              color: STAT_COLORS.negative,
              textShadow: `0 0 20px color-mix(in srgb, ${STAT_COLORS.negative} 40%, transparent)`,
            }}
          >
            Defeat
          </div>
          <div className="mt-1 text-xs text-muted">
            The squad was overrun · reached wave {Math.max(1, level)}
          </div>
        </div>
        <div className="px-6 pb-5 pt-4">
          <Button
            variant="gold"
            onClick={() => void travelTo('town')}
            className="w-full px-5 py-2.5 shadow-none"
          >
            Return to Town
          </Button>
          <div className="mt-2 text-center text-[11px] text-muted">
            Returning automatically in {secondsLeft}s…
          </div>
        </div>
      </Card>
    </Overlay>
  );
}
