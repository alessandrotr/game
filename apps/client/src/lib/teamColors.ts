import type { Team } from '@arena/shared';

/**
 * Canonical team colors, shared by every client surface that distinguishes
 * blue vs red (the 3D ground halos in PlayerEntity and the minimap blips), so
 * the two never drift apart.
 */
export const TEAM_COLORS: Record<Team, string> = {
  blue: '#5b8cff',
  red: '#ff6b6b',
};
