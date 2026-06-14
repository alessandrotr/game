import { useEffect, useRef, useState } from 'react';
import { Skull } from 'lucide-react';
import {
  ZOMBIE_FIRST_DELAY_MS,
  ZOMBIE_LEVEL_BREAK_MS,
  zombieHordeSize,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { HudZone } from './hud/HudLayout';

/** Toxic-green palette shared across the zombie HUD. */
const TOX = '#a6ff7f';
const TOX_BRIGHT = '#d8ffb0';
const TOX_DEEP = '#3a7d1f';
const THREAT = '#ff7a7a';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Zombie-survival HUD (MOBA-style): a compact command panel pinned top-center
 * with the current wave, a horde-clear progress bar (kills toward the wave
 * total), and a live "closing in" threat readout. Between waves it flips to a
 * filling countdown bar. Self-gates on `zombieMode`, so it's inert elsewhere.
 *
 * The big per-wave reveal lives in {@link WaveAnnouncement} (a centered flash),
 * rendered separately so it can sit over the whole screen.
 */
export function ZombieHud() {
  const zombieMode = useGameStore((s) => s.zombieMode);
  const level = useGameStore((s) => s.zombieLevel);
  const remaining = useGameStore((s) => s.zombiesRemaining);
  const alive = useGameStore((s) => s.zombiesAlive);

  if (!zombieMode) return null;

  // Level 0 = pre-game grace; remaining 0 mid-mode = the cleared-level breather.
  const warming = level === 0;
  const breather = !warming && remaining === 0;
  const active = !warming && !breather;

  const total = warming ? zombieHordeSize(1) : zombieHordeSize(level);
  const killed = Math.max(0, total - remaining);
  const pct = total > 0 ? clamp01(killed / total) * 100 : 0;
  const displayLevel = warming ? 1 : level;
  // Threat ramps the closing-in readout from caution → alarm as the pack grows.
  const heavy = alive >= 14;

  return (
    <HudZone zone="top-center">
      <div
        className="pointer-events-none relative flex items-stretch overflow-hidden rounded-xl border border-[#3a7d1f]/50 bg-[#0a1206]/85 backdrop-blur-sm"
        style={{ animation: 'wave-panel-glow 3.2s ease-in-out infinite' }}
      >
        {/* Top hairline accent. */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${TOX}, transparent)` }}
        />

        {/* Wave badge (left). */}
        <div
          className="relative flex w-[78px] shrink-0 flex-col items-center justify-center px-2 py-2.5"
          style={{ background: `linear-gradient(160deg, ${TOX_DEEP}55, transparent 80%)` }}
        >
          <Skull size={13} className="mb-0.5" style={{ color: `${TOX}cc` }} aria-hidden="true" />
          <span
            className="text-[8px] font-bold uppercase leading-none tracking-[0.28em]"
            style={{ color: `${TOX}99` }}
          >
            Wave
          </span>
          <span
            className="font-display text-[32px] font-black leading-none"
            style={{ color: TOX_BRIGHT, textShadow: '0 0 14px rgba(120,224,74,0.6)' }}
          >
            {displayLevel}
          </span>
        </div>

        {/* Vertical divider. */}
        <div className="my-2 w-px" style={{ background: `${TOX_DEEP}55` }} />

        {/* Info column (right). */}
        <div className="flex min-w-[224px] flex-col justify-center gap-1.5 px-4 py-2.5">
          {active ? (
            <>
              {/* Horde-clear progress. */}
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                <span style={{ color: `${TOX}d0` }}>Cleared</span>
                <span className="tabular-nums text-white/85">
                  {killed}
                  <span className="text-white/40"> / {total}</span>
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-black/60 ring-1 ring-inset ring-[#3a7d1f]/40">
                <div
                  className="absolute inset-y-0 left-0 overflow-hidden rounded-full transition-[width] duration-300 ease-out"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${TOX_DEEP}, ${TOX}, ${TOX_BRIGHT})`,
                    boxShadow: '0 0 8px rgba(120,224,74,0.6)',
                  }}
                >
                  {/* Energized sweep traveling along the fill. */}
                  <div
                    className="absolute inset-y-0 w-1/3 skew-x-[-20deg]"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
                      animation: 'wave-shimmer 2.2s ease-in-out infinite',
                    }}
                  />
                </div>
              </div>

              {/* Live threat readout. */}
              <div className="flex items-center gap-2 pt-0.5">
                <span className="relative flex h-2 w-2 items-center justify-center">
                  <span
                    className="absolute inline-flex h-2 w-2 rounded-full"
                    style={{
                      background: THREAT,
                      animation: `threat-pulse ${heavy ? 0.7 : 1.1}s ease-in-out infinite`,
                    }}
                  />
                </span>
                <span
                  className="text-[11px] font-bold uppercase tracking-wide tabular-nums"
                  style={{ color: heavy ? THREAT : '#ffb4b4' }}
                >
                  {alive} closing in
                </span>
                {heavy && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#ff7a7a]/70">
                    · swarm!
                  </span>
                )}
              </div>
            </>
          ) : (
            <CountdownState
              key={warming ? 'warm' : `break-${level}`}
              warming={warming}
              level={level}
              durationMs={warming ? ZOMBIE_FIRST_DELAY_MS : ZOMBIE_LEVEL_BREAK_MS}
            />
          )}
        </div>
      </div>
    </HudZone>
  );
}

/** The between-waves state: a headline + a bar that fills over the breather. */
function CountdownState({
  warming,
  level,
  durationMs,
}: {
  warming: boolean;
  level: number;
  durationMs: number;
}) {
  return (
    <>
      <div
        className="text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: `${TOX}d0` }}
      >
        {warming ? 'Get Ready' : `Wave ${level} Cleared`}
      </div>
      <div className="text-[12px] font-semibold text-white/90">
        {warming ? 'First horde incoming…' : 'Next horde incoming…'}
      </div>
      <div className="relative mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/60 ring-1 ring-inset ring-[#3a7d1f]/40">
        <div
          className="h-full origin-left rounded-full"
          style={{
            background: `linear-gradient(90deg, ${TOX}, ${TOX_BRIGHT})`,
            boxShadow: '0 0 8px rgba(120,224,74,0.5)',
            animation: `wave-incoming ${durationMs}ms linear forwards`,
          }}
        />
      </div>
    </>
  );
}

/**
 * Cinematic wave-start flash: a big centered "WAVE N" reveal fired each time a
 * new horde begins. Rendered as a transient overlay (sibling of the level-up
 * toast) so it sits over the whole screen. Self-gates on `zombieMode`.
 */
export function WaveAnnouncement() {
  const zombieMode = useGameStore((s) => s.zombieMode);
  const level = useGameStore((s) => s.zombieLevel);

  // Fire the flash on each wave increment (not on the initial observe, so joining
  // mid-run doesn't re-announce a wave already in progress).
  const prev = useRef<number | null>(null);
  const [shown, setShown] = useState<{ level: number; nonce: number } | null>(null);
  const nonce = useRef(0);

  useEffect(() => {
    const before = prev.current;
    prev.current = level;
    if (before === null || level <= before || level < 1) return;
    nonce.current += 1;
    setShown({ level, nonce: nonce.current });
    const id = setTimeout(() => setShown(null), 2800);
    return () => clearTimeout(id);
  }, [level]);

  if (!zombieMode || !shown) return null;
  const total = zombieHordeSize(shown.level);

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[24%] z-toast -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div
        key={shown.nonce}
        className="flex flex-col items-center"
        style={{ animation: 'wave-flash 2.8s ease-out forwards' }}
      >
        <div className="flex items-center gap-4" style={{ color: TOX }}>
          <Skull size={32} aria-hidden="true" style={{ filter: 'drop-shadow(0 0 10px rgba(120,224,74,0.7))' }} />
          <span
            className="font-display text-6xl font-black tracking-[0.15em]"
            style={{ textShadow: '0 0 32px rgba(120,224,74,0.7), 0 3px 10px rgba(0,0,0,0.7)' }}
          >
            WAVE {shown.level}
          </span>
          <Skull size={32} aria-hidden="true" style={{ filter: 'drop-shadow(0 0 10px rgba(120,224,74,0.7))' }} />
        </div>
        {/* Underline streak. */}
        <div
          className="mt-2 h-px w-56"
          style={{ background: `linear-gradient(90deg, transparent, ${TOX}, transparent)` }}
        />
        <div
          className="mt-2 text-sm font-bold uppercase tracking-[0.3em]"
          style={{ color: THREAT, textShadow: '0 2px 6px rgba(0,0,0,0.8)' }}
        >
          {total} undead approaching
        </div>
      </div>
    </div>
  );
}
