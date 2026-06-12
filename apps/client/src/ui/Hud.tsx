import { useGameStore } from '../store/useGameStore';
import { useHudStore } from '../store/useHudStore';
import { CombatHud } from './CombatHud';
import { Matchmaking } from './Matchmaking';
import { PlayerCard } from './PlayerCard';
import { MatchResult } from './MatchResult';
import { Leaderboard } from './Leaderboard';
import { LevelUpToast } from './LevelUpToast';
import { Paperdoll } from './Paperdoll';
import { GameMenu } from './hud/GameMenu';
import { SettingsPanel } from './hud/SettingsPanel';
import { HudLayout, HudZone } from './hud/HudLayout';

/**
 * In-game heads-up display, composed onto the HUD zone system.
 *
 * - Arena packs identity + controls into one bottom-center `CombatHud` (portrait,
 *   level, abilities, HP/MP). Town shows the rich `PlayerCard` top-left.
 * - The consolidated `GameMenu` (Change Character, Leaderboard, Settings) lives
 *   bottom-right in both rooms.
 * - The whole chrome layer hides on the `H` key (`useHudStore.hidden`); transient
 *   and critical overlays render outside that gate so they always show.
 */
export function Hud() {
  const inArena = useGameStore((s) => s.room) === 'arena';
  const hudHidden = useHudStore((s) => s.hidden);

  return (
    <>
      {!hudHidden && (
        <HudLayout>
          {inArena ? (
            <HudZone zone="bottom-center">
              <CombatHud />
            </HudZone>
          ) : (
            <HudZone zone="top-left">
              <PlayerCard />
            </HudZone>
          )}

          <HudZone zone="bottom-right">
            <GameMenu />
          </HudZone>
        </HudLayout>
      )}

      {/* Town matchmaking — self-positions its top-right trigger (hidden with the
          HUD) and renders its own critical modals (ready-check) unconditionally. */}
      {!inArena && <Matchmaking />}

      {/* Transient / critical overlays — always rendered, above the hide gate. */}
      <MatchResult />
      <LevelUpToast />
      <Paperdoll />
      <Leaderboard />
      <SettingsPanel />
    </>
  );
}
