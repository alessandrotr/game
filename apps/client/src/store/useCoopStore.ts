import { create } from 'zustand';
import { isZombieSkin, type PlayerView, type ZombieRunResults } from '@arena/shared';

/**
 * Local-player state for a co-op zombie run where death is final. Drives the
 * death prompt (Spectate / Return to Town), the spectate camera target, and the
 * end-of-run defeat screen. Not replicated — purely the local client's view of
 * its own death flow (the server owns who's alive).
 */
export type CoopPhase =
  /** Alive, or not in a co-op run — no overlay. */
  | 'playing'
  /** Just died: showing the Spectate / Return-to-Town choice. */
  | 'choosing'
  /** Chose to spectate: camera follows a living teammate. */
  | 'spectating';

interface CoopStore {
  phase: CoopPhase;
  /** Session id of the teammate being spectated ('' / null = none yet). */
  spectateTargetId: string | null;
  /** Set when the whole squad has fallen — the wave reached (for the defeat text). */
  gameOver: { level: number } | null;
  /** End-of-run stat card (per-player breakdown), if the server sent it. */
  runResults: ZombieRunResults | null;

  /** Local player just died — prompt the choice. */
  startChoosing: () => void;
  /** Chose to spectate `targetId`. */
  spectate: (targetId: string | null) => void;
  /** Switch the spectated teammate. */
  setSpectateTarget: (targetId: string | null) => void;
  /** The squad wiped — show the defeat screen. */
  setGameOver: (level: number) => void;
  /** Store the end-of-run stat card. */
  setRunResults: (results: ZombieRunResults) => void;
  /** Back to the clean state (fresh room / left / returned to town). */
  reset: () => void;
}

export const useCoopStore = create<CoopStore>((set) => ({
  phase: 'playing',
  spectateTargetId: null,
  gameOver: null,
  runResults: null,

  startChoosing: () => set({ phase: 'choosing' }),
  spectate: (spectateTargetId) => set({ phase: 'spectating', spectateTargetId }),
  setSpectateTarget: (spectateTargetId) => set({ spectateTargetId }),
  setGameOver: (level) => set({ gameOver: { level } }),
  setRunResults: (runResults) => set({ runResults }),
  reset: () => set({ phase: 'playing', spectateTargetId: null, gameOver: null, runResults: null }),
}));

/** Living human teammates (other players, alive, not zombies) — the candidates a
 *  dead co-op player can spectate, sorted by name for a stable cycle order. */
export function livingTeammates(
  players: Map<string, PlayerView>,
  myId: string | null,
): PlayerView[] {
  const out: PlayerView[] = [];
  players.forEach((p, id) => {
    if (id !== myId && p.alive && !isZombieSkin(p.skinId)) out.push(p);
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
