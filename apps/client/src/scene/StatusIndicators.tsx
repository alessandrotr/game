import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { StatusKind } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { sampleTransform, INTERP_DELAY_MS } from '../store/snapshotBuffer';
import { ShieldBubble } from '../render/shaders';

/**
 * Over-head status indicators driven entirely by replicated state: a row of
 * coloured pips (one per active crowd-control / buff / debuff status) and a
 * translucent bubble while a shield holds. Because statuses live on the synced
 * `Player` schema, this needs no bespoke per-ability code — a new status kind
 * just needs a colour below.
 */

const STATUS_COLOR: Record<StatusKind, string> = {
  stun: '#ffd24a',
  root: '#b9772e',
  silence: '#c060ff',
  slow: '#6bd0ff',
  haste: '#7cff9e',
  attack_speed: '#ffae42',
  damage_amp: '#ff5a5a',
  empower: '#ffd700',
  field: '#ffcf6b',
  dot: '#9b5cff',
  hot: '#7cff9e',
  shield: '#aab4ff',
};

const PIP_Y = 2.7;
const PIP_SIZE = 0.18;
const PIP_GAP = 0.26;

function PlayerStatusBadge({ sessionId }: { sessionId: string }) {
  // Re-render on each server tick so the active-status set stays current.
  useGameStore((s) => s.tick);
  const group = useRef<Group>(null);

  const isLocal = useGameStore.getState().sessionId === sessionId;
  const player = useGameStore.getState().players.get(sessionId);

  // Track the player's position every frame (mirrors PlayerEntity's sampling).
  useFrame(() => {
    const node = group.current;
    if (!node) return;
    if (isLocal) {
      const t = getLocalRenderTransform();
      if (t.active) node.position.set(t.x, PIP_Y, t.z);
    } else {
      const s = sampleTransform(sessionId, performance.now() - INTERP_DELAY_MS);
      if (s) node.position.set(s.x, PIP_Y, s.z);
    }
  });

  if (!player || !player.alive) return null;

  // De-duplicate by kind (the server keeps one per kind, but be defensive).
  const kinds = Array.from(new Set(player.statuses.map((s) => s.kind))).filter(
    (k) => k !== 'shield',
  );
  const hasShield = player.shield > 0;
  if (kinds.length === 0 && !hasShield) return null;

  const startX = -((kinds.length - 1) * PIP_GAP) / 2;

  return (
    <group ref={group}>
      {kinds.map((kind, i) => (
        <mesh key={kind} position={[startX + i * PIP_GAP, 0, 0]}>
          <boxGeometry args={[PIP_SIZE, PIP_SIZE, PIP_SIZE]} />
          <meshBasicMaterial color={STATUS_COLOR[kind]} />
        </mesh>
      ))}
      {hasShield && (
        // The badge anchors above the head (PIP_Y); drop the bubble down so it
        // sits centred on the body (~y 1.1) and actually wraps the player.
        <group position={[0, -1.55, 0]}>
          <ShieldBubble color={STATUS_COLOR.shield} radius={1.1} />
        </group>
      )}
    </group>
  );
}

/** One badge per player in the arena. */
export function StatusIndicators() {
  const playerIds = useGameStore((s) => s.playerIds);
  return (
    <>
      {playerIds.map((id) => (
        <PlayerStatusBadge key={id} sessionId={id} />
      ))}
    </>
  );
}
