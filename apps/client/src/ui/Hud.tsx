import { useGameStore } from '../store/useGameStore';
import { useHudStore } from '../store/useHudStore';
import { useAuthStore } from '../store/useAuthStore';
import { CombatHud } from './CombatHud';
import { Matchmaking } from './Matchmaking';
import { PlayerCard } from './PlayerCard';
import { MatchResult } from './MatchResult';
import { WaveAnnouncement, ZombieHud } from './ZombieHud';
import { Leaderboard } from './Leaderboard';
import { LevelUpToast } from './LevelUpToast';
import { Paperdoll } from './Paperdoll';
import { GameMenu } from './hud/GameMenu';
import { Minimap } from './hud/Minimap';
import { PerfOverlay } from './hud/PerfOverlay';
import { SettingsPanel } from './hud/SettingsPanel';
import { ControlsHelp } from './hud/ControlsHelp';
import { UpgradeAccountDialog } from './UpgradeAccountDialog';
import { HudLayout, HudZone } from './hud/HudLayout';

/**
 * In-game heads-up display, composed onto the HUD zone system.
 *
 * - Arena packs identity + controls into one bottom-center `CombatHud` (portrait,
 *   level, abilities, HP/MP). Town shows the rich `PlayerCard` top-left.
 * - The consolidated `GameMenu` (Change Character, Leaderboard, Settings) lives
 *   bottom-right in both rooms.
 * - The `H` key hides the HUD chrome (`useHudStore.hidden`). The arena CombatHud
 *   is combat-critical and stays visible regardless; only the menu, player card,
 *   matchmaking trigger, and chat hide. Transient/critical overlays render outside
 *   the gate so they always show.
 */
export function Hud() {
  const inArena = useGameStore((s) => s.room) === 'arena';
  const hudHidden = useHudStore((s) => s.hidden);
  const guest = useAuthStore((s) => s.guest);

  return (
    <>
      <HudLayout>
        {/* Arena combat HUD (portrait, abilities, HP/MP) — never hidden by H. */}
        {inArena && (
          <HudZone zone="bottom-center">
            <CombatHud />
          </HudZone>
        )}

        {/* Zombie-survival wave banner (top-center) — self-gates on zombie mode,
            stays visible like the combat HUD since it's mission-critical. */}
        {inArena && <ZombieHud />}

        {!hudHidden && (
          <>
            {!inArena && (
              <HudZone zone="top-left">
                <PlayerCard />
              </HudZone>
            )}
            {inArena && (
              <HudZone zone="top-right">
                <Minimap />
              </HudZone>
            )}
            <HudZone zone="bottom-right">
              <GameMenu />
            </HudZone>
          </>
        )}
      </HudLayout>

      {/* Town matchmaking — self-positions its top-right trigger (hidden with the
          HUD) and renders its own critical modals (ready-check) unconditionally. */}
      {!inArena && <Matchmaking />}

      {/* Perf stats overlay (top-right) — self-gates on the setting. */}
      <PerfOverlay />

      {/* Transient / critical overlays — always rendered, above the hide gate. */}
      <MatchResult />
      <LevelUpToast />
      <WaveAnnouncement />
      <Paperdoll />
      <Leaderboard />
      <SettingsPanel />
      <ControlsHelp />
      {guest && <UpgradeAccountDialog />}
    </>
  );
}
