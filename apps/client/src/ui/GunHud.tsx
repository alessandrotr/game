import { useEffect, useRef, useState } from 'react';
import { Crosshair, RotateCw, Zap } from 'lucide-react';
import { GUNS, GUN_RESERVE_INFINITE, isGunKind, type GunKind } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { isFpsEngaged } from '../store/fpsAim';

/** Gunmetal-orange palette, matching the Gun Mode portal. */
const STEEL = '#ffb066';
const STEEL_DEEP = '#8a3b12';

const SLOTS: { key: string; gun: GunKind }[] = [
  { key: '3', gun: 'pistol' },
  { key: '4', gun: 'machine_gun' },
];

/**
 * Gun Mode Zombie weapon HUD (bottom-right, above the menu): the equipped gun,
 * its magazine / reserve ammo, a reload progress bar, and the two weapon slots
 * (3 / 4) with the active one highlighted. Self-gates on `gunMode`.
 */
export function GunHud() {
  const gunMode = useGameStore((s) => s.gunMode);
  const gunView = useGameStore((s) => s.gunView);
  const sessionId = useGameStore((s) => s.sessionId);
  // Poll the (non-reactive) player snapshot at a light cadence — ammo changes
  // every shot but a few times/second is plenty for a HUD readout.
  const [, force] = useState(0);
  useEffect(() => {
    if (!gunMode) return;
    const id = window.setInterval(() => force((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [gunMode]);

  // Track when the current reload started so the bar can fill over reloadMs.
  const reloadStart = useRef<number | null>(null);

  if (!gunMode) return null;
  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  if (!me || !me.alive) {
    reloadStart.current = null;
    return null;
  }

  const gun = isGunKind(me.equippedGun) ? GUNS[me.equippedGun] : GUNS.pistol;

  if (me.reloading && reloadStart.current === null) reloadStart.current = performance.now();
  if (!me.reloading) reloadStart.current = null;
  const reloadPct =
    me.reloading && reloadStart.current !== null
      ? Math.min(100, ((performance.now() - reloadStart.current) / gun.reloadMs) * 100)
      : 0;

  const infiniteReserve = me.reserveAmmo === GUN_RESERVE_INFINITE;
  const lowMag = !me.reloading && me.magAmmo === 0;
  const fpsView = gunView === 'fps';
  const engaged = isFpsEngaged();

  return (
    <>
      {/* Center crosshair (first person only) — the gun fires straight down it,
          and the OS cursor is hidden under pointer lock. Top-down aims with the
          visible cursor, so no center reticle there. */}
      {fpsView && (
      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
        {engaged ? (
          <div className="relative h-5 w-5">
            <span
              className="absolute left-1/2 top-1/2 h-[2px] w-[7px] -translate-y-1/2"
              style={{ background: STEEL, left: 0 }}
            />
            <span
              className="absolute right-0 top-1/2 h-[2px] w-[7px] -translate-y-1/2"
              style={{ background: STEEL }}
            />
            <span
              className="absolute left-1/2 top-0 h-[7px] w-[2px] -translate-x-1/2"
              style={{ background: STEEL }}
            />
            <span
              className="absolute bottom-0 left-1/2 h-[7px] w-[2px] -translate-x-1/2"
              style={{ background: STEEL }}
            />
            <span
              className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: STEEL }}
            />
          </div>
        ) : (
          <div
            className="rounded-md border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ borderColor: `${STEEL_DEEP}aa`, color: STEEL, background: '#120a06cc' }}
          >
            Click to aim · right-click to fire
          </div>
        )}
      </div>
      )}

      <div className="pointer-events-none fixed bottom-28 right-6 z-30 select-none">
      <div
        className="flex flex-col gap-1.5 rounded-xl border bg-[#120a06]/85 px-3 py-2 backdrop-blur-sm"
        style={{ borderColor: `${STEEL_DEEP}aa` }}
      >
        {/* Equipped weapon + ammo */}
        <div className="flex items-center gap-3">
          <Crosshair size={16} style={{ color: STEEL }} aria-hidden="true" />
          <span
            className="text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: STEEL }}
          >
            {gun.name}
          </span>
          <span className="ml-auto flex items-baseline gap-1 font-mono tabular-nums">
            <span
              className="text-lg font-bold leading-none"
              style={{ color: lowMag ? '#ff7a7a' : '#fff' }}
            >
              {me.magAmmo}
            </span>
            <span className="text-[11px] leading-none text-white/45">
              / {infiniteReserve ? '∞' : me.reserveAmmo}
            </span>
          </span>
        </div>

        {/* Reload bar (or a thin idle rail) */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-100"
            style={{
              width: `${reloadPct}%`,
              background: `linear-gradient(90deg, ${STEEL_DEEP}, ${STEEL})`,
            }}
          />
        </div>

        {/* Weapon slots */}
        <div className="flex items-center gap-1.5">
          {SLOTS.map(({ key, gun: g }) => {
            const active = me.equippedGun === g;
            return (
              <div
                key={key}
                className="flex items-center gap-1 rounded-md border px-1.5 py-0.5"
                style={{
                  borderColor: active ? STEEL : 'rgba(255,255,255,0.12)',
                  background: active ? `${STEEL_DEEP}55` : 'transparent',
                }}
              >
                <span
                  className="text-[9px] font-bold leading-none"
                  style={{ color: active ? STEEL : 'rgba(255,255,255,0.4)' }}
                >
                  {key}
                </span>
                {g === 'machine_gun' ? (
                  <Zap size={10} style={{ color: active ? STEEL : 'rgba(255,255,255,0.4)' }} />
                ) : (
                  <Crosshair size={10} style={{ color: active ? STEEL : 'rgba(255,255,255,0.4)' }} />
                )}
              </div>
            );
          })}
          <span className="ml-1 flex items-center gap-1 text-[9px] text-white/40">
            <RotateCw size={9} /> R
          </span>
        </div>

        {/* Camera view + toggle hint */}
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-white/40">
          <span>{fpsView ? 'First Person' : 'Top-Down'}</span>
          <span>
            <span style={{ color: STEEL }}>V</span> view
          </span>
        </div>
      </div>
    </div>
    </>
  );
}
