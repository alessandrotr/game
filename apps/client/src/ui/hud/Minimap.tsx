import { useMemo } from 'react';
import { ARENA_HALF_SIZE } from '@arena/shared';
import { useGameStore } from '../../store/useGameStore';
import { useArenaLayout } from '../../scene/useArenaLayout';
import { Card } from '../primitives';

/** On-screen size of the map, in pixels. */
const MAP_PX = 152;
/** Team dot colors. */
const TEAM_COLOR = { blue: '#5b8cff', red: '#ff6b6b' } as const;

/** A single blip plotted on the map (world-space, drawn directly via the SVG
 *  viewBox so no manual scaling is needed). */
interface Blip {
  id: string;
  x: number;
  z: number;
  color: string;
  alive: boolean;
  isSelf: boolean;
}

/**
 * Top-down arena minimap. A pure client HUD overlay: every blip is read from the
 * already-replicated `players` snapshot (no server work, no network traffic) and
 * the cover circles come from the same `useArenaLayout` the 3D scene uses. The
 * SVG `viewBox` is the arena's world extent, so positions/radii are plotted in
 * world units with zero conversion math.
 *
 * Updates reactively once per server snapshot (~20 Hz) — the store bumps `tick`
 * each patch, which recomputes the blips; positions are static between patches,
 * so this matches the data exactly and costs a handful of dot re-renders.
 */
export function Minimap() {
  const tick = useGameStore((s) => s.tick);
  const sessionId = useGameStore((s) => s.sessionId);
  const { obstacles } = useArenaLayout();

  const blips = useMemo<Blip[]>(() => {
    // Read the non-reactive snapshot imperatively (see useGameStore); `tick` in
    // the deps drives the refresh each patch.
    void tick;
    const players = useGameStore.getState().players;
    return [...players.values()].map((p) => ({
      id: p.sessionId,
      x: p.x,
      z: p.z,
      color: TEAM_COLOR[p.team] ?? TEAM_COLOR.blue,
      alive: p.alive,
      isSelf: p.sessionId === sessionId,
    }));
  }, [tick, sessionId]);

  const H = ARENA_HALF_SIZE;

  return (
    <Card variant="hud" className="p-1.5" aria-label="Minimap">
      <svg
        width={MAP_PX}
        height={MAP_PX}
        viewBox={`${-H} ${-H} ${2 * H} ${2 * H}`}
        className="block rounded-lg bg-black/40"
      >
        {/* Cover obstacles — faint, just for orientation. */}
        {obstacles.map((o, i) => (
          <circle key={i} cx={o.x} cy={o.z} r={o.radius} fill="rgba(255,255,255,0.14)" />
        ))}

        {/* Players / bots. Dead are dimmed; the local player gets a white ring. */}
        {blips.map((b) => (
          <circle
            key={b.id}
            cx={b.x}
            cy={b.z}
            r={b.isSelf ? 1.5 : 1.1}
            fill={b.color}
            fillOpacity={b.alive ? 1 : 0.3}
            stroke={b.isSelf ? '#ffffff' : 'rgba(0,0,0,0.5)'}
            strokeWidth={b.isSelf ? 0.5 : 0.25}
          />
        ))}
      </svg>
    </Card>
  );
}
