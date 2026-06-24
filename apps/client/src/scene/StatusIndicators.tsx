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
  blind: '#7c7c8c',
  slow: '#6bd0ff',
  haste: '#7cff9e',
  attack_speed: '#ffae42',
  damage_amp: '#ff5a5a',
  empower: '#ffd700',
  field: '#ffcf6b',
  dot: '#9b5cff',
  hot: '#7cff9e',
  shield: '#aab4ff',
  poison: '#2ecc71',
  buff: '#fbbf24',
};

const PIP_Y = 2.7;
const PIP_SIZE = 0.18;
const PIP_GAP = 0.26;

/** A signature of a player's visible statuses + shield — changes only when the
 *  badge actually needs to redraw, so we re-render on that, not on every tick. */
function statusSignature(sessionId: string): string {
  const p = useGameStore.getState().players.get(sessionId);
  if (!p || !p.alive) return '';
  const kinds = p.statuses
    .map((s) => s.kind)
    .filter((k) => k !== 'shield')
    .sort()
    .join(',');
  return `${kinds}|${p.shield > 0 ? 's' : ''}`;
}

function PlayerStatusBadge({ sessionId }: { sessionId: string }) {
  const group = useRef<Group>(null);

  // Re-render only when this player's status set (or shield) actually changes,
  // rather than on every server tick (which churned all badges 20×/s).
  const signature = useGameStore(() => statusSignature(sessionId));

  const isLocal = useGameStore.getState().sessionId === sessionId;

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

  if (!signature) return null;
  const [kindsPart, shieldPart] = signature.split('|');
  const kinds = (kindsPart ? kindsPart.split(',') : []) as StatusKind[];
  const hasShield = shieldPart === 's';
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
