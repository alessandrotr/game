import { useGameStore } from '../store/useGameStore';
import { useHudStore } from '../store/useHudStore';
import { useFocusStore } from '../store/useFocusStore';
import { CombatHud } from './CombatHud';
import { Matchmaking } from './Matchmaking';
import { MatchQueue } from './MatchQueue';
import { ZombieMatchmaking } from './ZombieMatchmaking';
import { ZombieMatchQueue } from './ZombieMatchQueue';
import { CoopOverlay } from './CoopOverlay';
import { MatchResult } from './MatchResult';
import { WaveAnnouncement, ZombieHud } from './ZombieHud';
import { Leaderboard } from './Leaderboard';
import { FocusTitle } from './FocusTitle';
import { PaintOverlay } from './PaintOverlay';
import { LevelUpToast } from './LevelUpToast';
import { InviteToast } from './InviteToast';
import { Paperdoll } from './Paperdoll';
import { Minimap } from './hud/Minimap';
import { PerfOverlay } from './hud/PerfOverlay';
import { Sidebar } from './hud/sidebar/Sidebar';
import { HudLayout, HudZone } from './hud/HudLayout';
import { MobileJoystickGate } from './hud/MobileJoystick';
import { PerkPicker } from './PerkPicker';
import { PerkBar } from './PerkBar';
import { HeldPickableIndicator } from './HeldPickableIndicator';

/**
 * In-game heads-up display, composed onto the HUD zone system.
 *
 * - Arena packs identity + controls into one bottom-center `CombatHud` (portrait,
 *   level, abilities, HP/MP).
 * - Town's identity + everything else lives in the unified `Sidebar` on the right
 *   edge (champion portrait + level, wardrobe, store, leaderboard, controls,
 *   settings, account actions) — town-only.
 * - The `H` key hides the HUD chrome (`useHudStore.hidden`). The arena CombatHud
 *   is combat-critical and stays visible regardless; only the sidebar, player card,
 *   matchmaking trigger, and chat hide. Transient/critical overlays render outside
 *   the gate so they always show.
 */
export function Hud() {
  const inArena = useGameStore((s) => s.room) === 'arena';
  const hudHidden = useHudStore((s) => s.hidden);
  // A cinematic structure focus clears the chrome too, for a clean staged view —
  // only the docked panel + big title remain.
  const focused = useFocusStore((s) => !!s.target);
  const chromeHidden = hudHidden || focused;

  return (
    <>
      <HudLayout>
        {/* Arena combat HUD (portrait, abilities, HP/MP) — never hidden by H. */}
        {inArena && (
          <HudZone zone="bottom-center">
            <div className="flex flex-col items-center gap-0">
              {/* Perk picker (slides up above the ability bar on wave clear). */}
              <PerkPicker />
              <div className="flex items-end gap-2">
                {/* Active perk icons (left of the ability bar). */}
                <PerkBar />
                <CombatHud />
                {/* Held pickable (molotov / grenade) — mirrors the perk icons on
                    the right of the ability bar. */}
                <HeldPickableIndicator />
              </div>
            </div>
          </HudZone>
        )}

        {/* Zombie-survival wave banner (top-center) — self-gates on zombie mode,
            stays visible like the combat HUD since it's mission-critical. */}
        {inArena && <ZombieHud />}

        {!chromeHidden && inArena && (
          <HudZone zone="top-right">
            <Minimap />
          </HudZone>
        )}
      </HudLayout>

      {/* Unified town sidebar (right edge) — rail + expanding panel. Town-only and
          hidden with the rest of the chrome. */}
      {!inArena && !chromeHidden && <Sidebar />}

      {/* Town matchmaking — self-positions its top-right trigger (hidden with the
          HUD) and renders its own critical modals (ready-check) unconditionally. */}
      {!inArena && <Matchmaking />}
      {/* Standalone "your match" queue button + dialog (top-right of the main HUD,
          independent of the matchmaking menu + cinematic focus). */}
      {!inArena && <MatchQueue />}
      {/* Co-op Zombie matchmaking — a separate town trigger + squad menu. */}
      {!inArena && <ZombieMatchmaking />}
      {/* Standalone "your squad" queue button + dialog (main HUD, top-right). */}
      {!inArena && <ZombieMatchQueue />}

      {/* Co-op death flow (spectate / defeat) — self-gates on a co-op zombie run. */}
      {inArena && <CoopOverlay />}

      {/* Perf stats overlay (top-right) — self-gates on the setting. */}
      <PerfOverlay />

      {/* Floating movement joystick (touch devices only) — the standard mobile
          control; inert / unmounted on desktop. */}
      <MobileJoystickGate />

      {/* Transient / critical overlays — always rendered, above the hide gate. */}
      <MatchResult />
      <LevelUpToast />
      {!inArena && <InviteToast />}
      <WaveAnnouncement />
      <Paperdoll />
      <FocusTitle />
      <Leaderboard />
      {/* Full-screen paint studio — launched from the sidebar's Champion hub. */}
      <PaintOverlay />
    </>
  );
}
