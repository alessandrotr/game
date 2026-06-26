import { LeaderboardContent } from '../../../Leaderboard';
import { useSidebarStore } from '../useSidebarStore';

/**
 * Sidebar host for the leaderboard — renders the shared `LeaderboardContent`,
 * fetching standings only while this section is the active one. (The diegetic
 * town tablet renders the same content in its docked dialog.)
 */
export function LeaderboardSection() {
  const active = useSidebarStore((s) => s.active === 'leaderboard');
  return <LeaderboardContent active={active} />;
}
