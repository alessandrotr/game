import type { LobbyView, ZombieLobbyView } from '@arena/shared';
import { useLobbyStore } from '../store/useLobbyStore';
import { useZombieLobbyStore } from '../store/useZombieLobbyStore';

/**
 * Live activity counters shown under the focus title for the matchmaking shrines —
 * how many matches are live, players queued, lobbies open right now. Reads the
 * lobby stores (whose connections run in parallel with the town), so the numbers
 * tick in real time. Styled like a modern game's "server activity" readout.
 */

interface Stat {
  value: number;
  label: string;
  /** Pulsing live dot — for the "right now / in progress" stat. */
  live?: boolean;
}

/** Occupied seats across both teams of a PvP lobby. */
function occupants(l: LobbyView): number {
  return [...l.blue, ...l.red].filter((s) => s.sessionId !== '').length;
}

export function PvpStats() {
  const lobbies = useLobbyStore((s) => s.lobbies);
  const queuing = lobbies.filter((l) => l.status === 'queuing');
  const stats: Stat[] = [
    { value: lobbies.filter((l) => l.status === 'playing').length, label: 'Duels Live', live: true },
    { value: queuing.reduce((n, l) => n + occupants(l), 0), label: 'In Queue' },
    { value: queuing.length, label: 'Open Lobbies' },
  ];
  return <StatRow stats={stats} />;
}

export function CoopStats() {
  const lobbies = useZombieLobbyStore((s) => s.lobbies);
  const stats: Stat[] = [
    { value: lobbies.filter((l) => l.status === 'playing').length, label: 'Raids Live', live: true },
    { value: lobbies.reduce((n, l: ZombieLobbyView) => n + l.members.length, 0), label: 'Survivors' },
    { value: lobbies.filter((l) => l.status === 'queuing').length, label: 'Open Squads' },
  ];
  return <StatRow stats={stats} />;
}

function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <div className="mt-7">
      <div className="mb-4 h-px w-44 bg-linear-to-r from-white/25 to-transparent" />
      <div className="flex items-stretch gap-6">
        {stats.map((s, i) => (
          <div key={s.label} className="flex items-stretch gap-6">
            {i > 0 && <span className="w-px self-stretch bg-white/10" />}
            <StatCounter stat={s} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCounter({ stat }: { stat: Stat }) {
  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-2">
        {stat.live && (
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
          </span>
        )}
        <span className="font-display text-4xl font-black leading-none tabular-nums text-text [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">
          {stat.value}
        </span>
      </span>
      <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{stat.label}</span>
    </div>
  );
}
