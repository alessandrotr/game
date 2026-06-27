import { useEffect, type ReactNode } from 'react';
import { Clock, Crown, Eye, Flame, LogOut, Shield, Skull, Swords } from 'lucide-react';
import type { ZombieRunResultLine, ZombieRunResults } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { livingTeammates, useCoopStore } from '../store/useCoopStore';
import { travelTo } from '../network/colyseus';
import { Button, Card, Overlay } from './primitives';
import { RematchControls } from './RematchControls';
import { STAT_COLORS } from './theme';

/** Total zombies a player felled (all variants, including bosses). */
const totalKills = (p: ZombieRunResultLine): number =>
  p.killsNormal + p.killsSprinter + p.killsFat + p.killsMiniboss + p.killsTitan;

/** Whole-squad totals, derived from the per-player lines. */
function teamTotals(players: ZombieRunResultLine[]) {
  return players.reduce(
    (acc, p) => ({
      kills: acc.kills + totalKills(p),
      bosses: acc.bosses + p.killsMiniboss + p.killsTitan,
      damageDealt: acc.damageDealt + p.damageDealt,
      damageTaken: acc.damageTaken + p.damageTaken,
    }),
    { kills: 0, bosses: 0, damageDealt: 0, damageTaken: 0 },
  );
}

/** Seconds → `m:ss`. */
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Compact number (1234 → 1.2k). */
function fmtNum(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}


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

/** The whole squad fell — defeat screen with the end-of-run stat card. Stays up
 *  until the rematch vote resolves (recreate the run, or everyone → town). */
function DefeatScreen({ level }: { level: number }) {
  const results = useCoopStore((s) => s.runResults);
  const sessionId = useGameStore((s) => s.sessionId);
  const myName = sessionId ? (useGameStore.getState().players.get(sessionId)?.name ?? null) : null;

  return (
    <Overlay closeOnBackdrop={false}>
      <Card variant="modal" className={results ? 'w-[520px]' : 'w-[400px]'}>
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

        {results && <RunStats results={results} myName={myName} />}

        <div className="px-6 pb-5 pt-4">
          <RematchControls />
        </div>
      </Card>
    </Overlay>
  );
}

/** A single team-summary chip (icon + value + label). */
function SummaryChip({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-white/5 px-2 py-2">
      <div className="flex items-center gap-1 text-text">
        {icon}
        <span className="font-display text-lg font-bold leading-none">{value}</span>
      </div>
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}

/** The end-of-run breakdown: team totals + a per-player table. */
function RunStats({ results, myName }: { results: ZombieRunResults; myName: string | null }) {
  const totals = teamTotals(results.players);
  // Sort by total kills so the top fragger leads; stable for equal scores.
  const rows = [...results.players].sort((a, b) => totalKills(b) - totalKills(a));

  return (
    <div className="border-y border-white/10 px-6 py-4">
      <div className="mb-3 grid grid-cols-4 gap-2">
        <SummaryChip
          icon={<Swords size={14} className="text-negative" aria-hidden="true" />}
          value={fmtNum(totals.kills)}
          label="Kills"
        />
        <SummaryChip
          icon={<Crown size={14} className="text-gold" aria-hidden="true" />}
          value={String(totals.bosses)}
          label="Bosses"
        />
        <SummaryChip
          icon={<Flame size={14} className="text-negative" aria-hidden="true" />}
          value={fmtNum(totals.damageDealt)}
          label="Damage"
        />
        <SummaryChip
          icon={<Clock size={14} className="text-muted" aria-hidden="true" />}
          value={fmtTime(results.durationSec)}
          label="Survived"
        />
      </div>

      {/* Per-player table */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 gap-y-1 text-xs">
        <div className="text-[10px] uppercase tracking-wide text-muted">Player</div>
        <div className="text-right text-[10px] uppercase tracking-wide text-muted" title="Kills">
          <Swords size={11} className="inline" aria-label="Kills" />
        </div>
        <div className="text-right text-[10px] uppercase tracking-wide text-muted" title="Bosses">
          <Crown size={11} className="inline" aria-label="Bosses" />
        </div>
        <div className="text-right text-[10px] uppercase tracking-wide text-muted" title="Damage dealt">
          <Flame size={11} className="inline" aria-label="Damage dealt" />
        </div>
        <div className="text-right text-[10px] uppercase tracking-wide text-muted" title="Damage taken">
          <Shield size={11} className="inline" aria-label="Damage taken" />
        </div>

        {rows.map((p, i) => {
          const isMe = myName !== null && p.name === myName;
          return (
            <RunStatsRow key={`${p.name}-${i}`} player={p} isMe={isMe} />
          );
        })}
      </div>
    </div>
  );
}

function RunStatsRow({ player, isMe }: { player: ZombieRunResultLine; isMe: boolean }) {
  return (
    <>
      <div className={`truncate ${isMe ? 'font-semibold text-gold' : 'text-text'}`}>
        {player.name}
        <span className="ml-1 text-[10px] capitalize text-muted">{player.characterClass}</span>
      </div>
      <div className="text-right tabular-nums text-text">{totalKills(player)}</div>
      <div className="text-right tabular-nums text-text">
        {player.killsMiniboss + player.killsTitan}
      </div>
      <div className="text-right tabular-nums text-text">{fmtNum(player.damageDealt)}</div>
      <div className="text-right tabular-nums text-muted">{fmtNum(player.damageTaken)}</div>
    </>
  );
}
