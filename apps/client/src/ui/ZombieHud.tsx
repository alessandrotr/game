import { useEffect, useRef, useState } from 'react';
import { Heart, Skull, Zap } from 'lucide-react';
import {
  ZOMBIE_FIRST_DELAY_MS,
  ZOMBIE_LEVEL_BREAK_MS,
  zombieHordeSize,
  zombieSpeedForLevel,
} from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { HudZone } from './hud/HudLayout';

/** Toxic-green palette shared across the zombie HUD. */
const TOX = '#a6ff7f';
const THREAT = '#ff7a7a';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Zombie-survival HUD (MOBA-style): a compact command panel pinned top-center
 * with the current wave, a horde-clear progress bar (kills toward the wave
/** Custom Medieval Skull SVG with eyes that turn red dynamically */
function MedievalSkull({ size = 14, eyeRedness = 0 }: { size?: number; eyeRedness: number }) {
  // Normal eye socket color is empty (transparent, letting background show).
  // As eyeRedness goes from 0 to 1, fill with red `#ff0000` and add glowing filter drop-shadow.
  const eyeColor = `rgba(255, 0, 0, ${eyeRedness})`;
  const eyeGlow =
    eyeRedness > 0 ? `drop-shadow(0 0 ${eyeRedness * 3}px rgba(255, 0, 0, 0.9))` : 'none';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mb-0.5 transition-all duration-300"
      style={{ color: '#d4af37' }} // Warm medieval gold outline for the skull
      aria-hidden="true"
    >
      {/* Skull Base Outline */}
      <path d="M2 10a10 10 0 0 1 20 0v3a2 2 0 0 1-2 2h-1.5a1 1 0 0 0-1 1v1.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 17.5V16a1 1 0 0 0-1-1H3.5a2 2 0 0 1-2-2z" />

      {/* Nose */}
      <path d="M12 13v1.5" strokeWidth="1.5" />
      <path d="M10.5 14.5h3" strokeWidth="1.5" />

      {/* Teeth */}
      <path d="M9 18h6" />
      <path d="M10.5 18v2" strokeWidth="1.5" />
      <path d="M12 18v2" strokeWidth="1.5" />
      <path d="M13.5 18v2" strokeWidth="1.5" />

      {/* Left Eye (Symmetrical, cx=9) */}
      <circle cx="9" cy="10" r="1.5" fill={eyeColor} stroke="none" style={{ filter: eyeGlow }} />
      {/* Right Eye (Symmetrical, cx=15) */}
      <circle cx="15" cy="10" r="1.5" fill={eyeColor} stroke="none" style={{ filter: eyeGlow }} />
    </svg>
  );
}

/**
 * Zombie-survival HUD (Medieval RPG style): a slim command bar pinned top-center
 * with the current wave, a wave-clear progress indicator, and a live threat readout.
 * Between waves it displays a countdown. Self-gates on `zombieMode`, so it's inert elsewhere.
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

  // Sits at 0 for waves 1 to 3, then scales from 0 to 1 from wave 3 to 16.
  const eyeRedness = Math.max(0, Math.min(1, (displayLevel - 3) / 13));

  return (
    <HudZone zone="top-center">
      <div className="pointer-events-none relative flex h-10 items-center overflow-hidden rounded-md border-2 border-[#d4af37]/80 bg-gradient-to-b from-[#222422] to-[#0a0a0a] px-4 shadow-[0_6px_20px_rgba(0,0,0,0.85),inset_0_0_12px_rgba(212,175,55,0.25)]">
        <div className="flex items-center gap-4 text-xs font-semibold tracking-wide">
          {/* Wave indicator */}
          <div className="flex items-center gap-2 font-display text-white/95">
            <MedievalSkull size={16} eyeRedness={eyeRedness} />
            <span
              className="font-display font-black text-sm uppercase tracking-[0.1em] text-[#d4af37]"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
            >
              WAVE {displayLevel}
            </span>
          </div>

          {/* Divider */}
          <div className="w-[1.5px] h-4 bg-gradient-to-b from-transparent via-[#d4af37]/45 to-transparent" />

          {active ? (
            <>
              {/* Cleared progress text */}
              <div
                className="flex items-center gap-1.5 text-[#ebdcb9] font-medium"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
              >
                <span>Cleared</span>
                <span className="font-bold tabular-nums text-white">
                  {killed}
                  <span className="text-white/40">/{total}</span>
                </span>
              </div>

              {/* Divider */}
              <div className="w-[1.5px] h-4 bg-gradient-to-b from-transparent via-[#d4af37]/45 to-transparent" />

              {/* Closing In active count */}
              <div className="flex items-center">
                <span
                  className="font-display font-bold uppercase tracking-[0.08em] text-[#ff3a3a] tabular-nums animate-pulse"
                  style={{
                    textShadow: '0 0 10px rgba(255,58,58,0.7), 0 1px 2px rgba(0,0,0,0.9)',
                  }}
                >
                  {alive} Closing In
                </span>
              </div>
            </>
          ) : (
            <CountdownState
              key={warming ? 'warm' : `break-${level}`}
              warming={warming}
              level={level}
            />
          )}
        </div>

        {/* Bottom edge progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/50">
          {active ? (
            <div
              className="h-full transition-[width] duration-300 ease-out"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #6b0f0f, #c91e1e, #ff3c3c)',
                boxShadow: '0 -1px 6px rgba(255,60,60,0.6)',
              }}
            />
          ) : (
            <div
              className="h-full origin-left"
              style={{
                background: 'linear-gradient(90deg, #a3802e, #d4af37)',
                boxShadow: '0 -1px 6px rgba(212,175,55,0.6)',
                animation: `wave-incoming ${warming ? ZOMBIE_FIRST_DELAY_MS : ZOMBIE_LEVEL_BREAK_MS}ms linear forwards`,
              }}
            />
          )}
        </div>
      </div>
    </HudZone>
  );
}

/** The between-waves state: a simple text announcement aligned in the row. */
function CountdownState({ warming, level }: { warming: boolean; level: number }) {
  return (
    <div
      className="flex items-center gap-2 text-[#ebdcb9] font-medium"
      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
    >
      <span className="font-display font-bold text-[#d4af37]">
        {warming ? 'Get Ready' : `Wave ${level} Cleared`}
      </span>
      <div className="w-px h-3 bg-[#d4af37]/30" />
      <span className="text-white/70">
        {warming ? 'First horde incoming…' : 'Next horde incoming…'}
      </span>
    </div>
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
  const unlockedSections = useGameStore((s) => s.unlockedSections);
  const minibossAlert = useGameStore((s) => s.minibossAlert);

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

  // Door unlock announcement — fires when unlockedSections actually changes
  // (i.e. when a wave is CLEARED and the door opens), not when the wave starts.
  const prevSections = useRef<number | null>(null);
  const [doorMsg, setDoorMsg] = useState<string | null>(null);
  const doorNonce = useRef(0);

  useEffect(() => {
    const before = prevSections.current;
    prevSections.current = unlockedSections;
    if (before === null || unlockedSections <= before) return;
    const names = ['North Wing', 'East Wing', 'South Wing', 'West Wing'];
    const name = names[before] ?? 'New Area';
    doorNonce.current += 1;
    setDoorMsg(`${name} Unlocked!`);
    const id = setTimeout(() => setDoorMsg(null), 3000);
    return () => clearTimeout(id);
  }, [unlockedSections]);

  // Mini-boss drop alert
  const [hudAlert, setHudAlert] = useState<string | null>(null);
  const alertNonce = useRef(0);

  useEffect(() => {
    if (!minibossAlert) return;
    alertNonce.current = minibossAlert.nonce;
    setHudAlert(minibossAlert.text);
    const id = setTimeout(() => setHudAlert(null), 4000);
    return () => clearTimeout(id);
  }, [minibossAlert]);

  if (!zombieMode) return null;

  return (
    <>
      {/* Wave start flash */}
      {shown &&
        (() => {
          const total = zombieHordeSize(shown.level);
          const speedUp = zombieSpeedForLevel(shown.level) > zombieSpeedForLevel(shown.level - 1);
          const bossWave = shown.level > 0 && shown.level % 6 === 0;

          return (
            <div
              className="pointer-events-none absolute left-1/2 top-[24%] z-toast -translate-x-1/2"
              role="status"
              aria-live="polite"
            >
              <div
                key={shown.nonce}
                className="flex flex-col items-center gap-1.5"
                style={{ animation: 'wave-flash 2.8s ease-out forwards' }}
              >
                <div className="flex items-center gap-4" style={{ color: TOX }}>
                  <Skull
                    size={32}
                    aria-hidden="true"
                    style={{ filter: 'drop-shadow(0 0 10px rgba(120,224,74,0.7))' }}
                  />
                  <span
                    className="font-display text-6xl font-black tracking-[0.15em]"
                    style={{
                      textShadow: '0 0 32px rgba(120,224,74,0.7), 0 3px 10px rgba(0,0,0,0.7)',
                    }}
                  >
                    WAVE {shown.level}
                  </span>
                  <Skull
                    size={32}
                    aria-hidden="true"
                    style={{ filter: 'drop-shadow(0 0 10px rgba(120,224,74,0.7))' }}
                  />
                </div>
                {/* Underline streak. */}
                <div
                  className="mt-1 h-px w-56"
                  style={{ background: `linear-gradient(90deg, transparent, ${TOX}, transparent)` }}
                />
                <div
                  className="mt-1 text-sm font-bold uppercase tracking-[0.3em]"
                  style={{ color: THREAT, textShadow: '0 2px 6px rgba(0,0,0,0.8)' }}
                >
                  {total} undead approaching
                </div>

                {/* Alerts container */}
                <div className="flex flex-col items-center gap-1.5 mt-2">
                  {speedUp && (
                    <div
                      className="flex items-center gap-1.5 rounded-full border border-gold/50 bg-black/50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-gold"
                      style={{
                        textShadow: '0 0 12px rgba(200,162,74,0.6)',
                        animation: 'threat-pulse 0.5s ease-in-out 4',
                      }}
                    >
                      <Zap size={13} aria-hidden="true" />
                      The horde is faster
                    </div>
                  )}

                  {bossWave && (
                    <div
                      className="flex items-center gap-1.5 rounded-full border border-red-500/50 bg-black/50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                      style={{
                        textShadow: '0 0 12px rgba(239,68,68,0.6)',
                        animation: 'threat-pulse 0.5s ease-in-out 4',
                      }}
                    >
                      <Skull size={13} aria-hidden="true" />
                      Dread Knight Approaches!
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* Door unlock announcement — separate from wave flash */}
      {doorMsg && (
        <div
          className="pointer-events-none absolute left-1/2 top-[40%] z-toast -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <div
            key={doorNonce.current}
            className="flex flex-col items-center gap-1.5"
            style={{ animation: 'wave-flash 3s ease-out forwards' }}
          >
            <div
              className="flex items-center gap-2 rounded-full border border-blue-400/60 bg-black/60 px-5 py-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-300 shadow-[0_0_20px_rgba(96,165,250,0.4)]"
              style={{
                textShadow: '0 0 14px rgba(96,165,250,0.7)',
                animation: 'threat-pulse 0.5s ease-in-out 4',
              }}
            >
              <Zap size={16} aria-hidden="true" />
              {doorMsg}
            </div>
          </div>
        </div>
      )}
      {/* Mini-boss drop announcement */}
      {hudAlert && (
        <div
          className="pointer-events-none absolute left-1/2 top-[47%] z-toast -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <div
            key={alertNonce.current}
            className="flex flex-col items-center gap-1.5"
            style={{ animation: 'wave-flash 4s ease-out forwards' }}
          >
            <div
              className="flex items-center gap-2 rounded-full border border-green-500/60 bg-black/60 px-5 py-2 text-sm font-bold uppercase tracking-[0.2em] text-green-300 shadow-[0_0_20px_rgba(34,197,94,0.4)]"
              style={{
                textShadow: '0 0 14px rgba(34,197,94,0.7)',
                animation: 'threat-pulse 0.5s ease-in-out 4',
              }}
            >
              <Heart size={16} className="text-green-400 fill-green-400" aria-hidden="true" />
              {hudAlert}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
