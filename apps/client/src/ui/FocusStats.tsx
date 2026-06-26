import type { ZombieLobbyView } from '@arena/shared';
import { countForMode, useQueueStore } from '../store/useQueueStore';
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

export function PvpStats() {
  const members = useQueueStore((s) => s.members);
  const solo = countForMode(members, '1v1');
  const stats: Stat[] = [
    { value: members.length, label: 'In Queue', live: true },
    { value: solo, label: 'Solo (1v1)' },
    { value: members.length - solo, label: 'Teams' },
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
