import { useMemo, type MouseEvent } from 'react';
import { ARENA_HALF_SIZE, ZOMBIE_ROOM_HALF_SIZE } from '@arena/shared';
import { useGameStore } from '../../store/useGameStore';
import { useArenaLayout } from '../../scene/useArenaLayout';
import { sendMoveTo } from '../../network/colyseus';
import { TEAM_COLORS } from '../../lib/teamColors';
import { Card } from '../primitives';

/** On-screen size of the map, in pixels. */
const MAP_PX = 152;

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
 *
 * When the room expansion system is active (zombie mode with unlocked sections),
 * the viewBox expands to cover the full play area and door indicators are drawn.
 */
export function Minimap() {
  const tick = useGameStore((s) => s.tick);
  const sessionId = useGameStore((s) => s.sessionId);
  const zombieMode = useGameStore((s) => s.zombieMode);
  const unlockedSections = useGameStore((s) => s.unlockedSections);
  const { obstacles } = useArenaLayout();

  // Use expanded bounds when sections are unlocked.
  const H = zombieMode && unlockedSections > 0 ? ZOMBIE_ROOM_HALF_SIZE : ARENA_HALF_SIZE;

  const blips = useMemo<Blip[]>(() => {
    // Read the non-reactive snapshot imperatively (see useGameStore); `tick` in
    // the deps drives the refresh each patch.
    void tick;
    const players = useGameStore.getState().players;
    return [...players.values()].map((p) => ({
      id: p.sessionId,
      x: p.x,
      z: p.z,
      color: TEAM_COLORS[p.team] ?? TEAM_COLORS.blue,
      alive: p.alive,
      isSelf: p.sessionId === sessionId,
    }));
  }, [tick, sessionId]);

  // The camera's resting orientation is mirrored 180° for red (see CameraRig),
  // so flip the map to match — "up" stays "toward the enemy" for both teams.
  const isRed = useMemo(
    () => useGameStore.getState().players.get(sessionId ?? '')?.team === 'red',
    [sessionId],
  );

  // Right-click a spot to walk there (matches the in-scene hold-to-move button).
  // The viewBox is the world extent, so the pixel→world map is a simple inverse;
  // for red the map is rotated 180°, so the world point is negated to match.
  const onContextMenu = (e: MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const sign = isRed ? -1 : 1;
    const x = (((e.clientX - rect.left) / rect.width) * (2 * H) - H) * sign;
    const z = (((e.clientY - rect.top) / rect.height) * (2 * H) - H) * sign;
    sendMoveTo(clamp(x, -H, H), clamp(z, -H, H));
  };

  return (
    <Card variant="hud" className="p-1.5" aria-label="Minimap">
      <svg
        width={MAP_PX}
        height={MAP_PX}
        viewBox={`${-H} ${-H} ${2 * H} ${2 * H}`}
        onContextMenu={onContextMenu}
        className="pointer-events-auto block cursor-pointer rounded-lg bg-black/40"
      >
        <g transform={isRed ? 'rotate(180)' : undefined}>
          {/* Main room boundary outline (always visible in zombie mode). */}
          {zombieMode && (
            <rect
              x={-ARENA_HALF_SIZE}
              y={-ARENA_HALF_SIZE}
              width={ARENA_HALF_SIZE * 2}
              height={ARENA_HALF_SIZE * 2}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={0.5}
            />
          )}

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
        </g>
      </svg>
    </Card>
  );
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
