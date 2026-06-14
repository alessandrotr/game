import { useEffect, useRef, useState } from 'react';
import { Keyboard, Menu, RotateCcw, Settings, Trophy, UserPlus, type LucideIcon } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useLeaderboardStore } from '../../store/useLeaderboardStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useControlsStore } from '../../store/useControlsStore';
import { useUpgradeStore } from '../../store/useUpgradeStore';
import { leaveToCharacterSelect } from '../../network/colyseus';
import { Button, Card, IconButton } from '../primitives';

/** One row in the menu — an icon + label that runs an action and closes the menu. */
function MenuItem({ icon: Icon, label, onSelect }: { icon: LucideIcon; label: string; onSelect: () => void }) {
  return (
    <Button
      variant="ghost"
      size="none"
      onClick={onSelect}
      className="w-full justify-start gap-2.5 rounded-lg px-3 py-2 text-[13px] text-text hover:bg-white/5"
    >
      <Icon size={15} aria-hidden="true" className="text-muted" />
      {label}
    </Button>
  );
}

/**
 * The consolidated game menu — a single gear button anchored bottom-right that
 * opens a small panel of system actions (Change Character, Leaderboard,
 * Settings). Replaces the scattered town buttons that used to float in the
 * top-left. Lightweight on purpose: a local open state with outside-click /
 * Escape close, no extra Radix dependency.
 */
export function GameMenu() {
  const inArena = useGameStore((s) => s.room) === 'arena';
  const guest = useAuthStore((s) => s.guest);
  const openLeaderboard = () => useLeaderboardStore.getState().setOpen(true);
  const openSettings = () => useSettingsStore.getState().setOpen(true);
  const openControls = () => useControlsStore.getState().setOpen(true);
  const openUpgrade = () => useUpgradeStore.getState().setOpen(true);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape while the menu is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The game menu is a town-only HUD affordance — hidden entirely in the arena.
  if (inArena) return null;

  /** Run an action and dismiss the menu. */
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      {open && (
        <Card
          variant="hud"
          role="menu"
          className="absolute bottom-full right-0 z-popover mb-2 w-52 p-1.5"
        >
          {guest && (
            <MenuItem icon={UserPlus} label="Save Progress" onSelect={run(openUpgrade)} />
          )}
          <MenuItem icon={RotateCcw} label="Change Character" onSelect={run(leaveToCharacterSelect)} />
          <MenuItem icon={Trophy} label="Leaderboard" onSelect={run(openLeaderboard)} />
          <MenuItem icon={Keyboard} label="Controls" onSelect={run(openControls)} />
          <MenuItem icon={Settings} label="Settings" onSelect={run(openSettings)} />
        </Card>
      )}
      <IconButton
        icon={Menu}
        variant="panel"
        aria-label="Game menu"
        aria-haspopup="menu"
        aria-expanded={open}
        iconSize={18}
        onClick={() => setOpen((v) => !v)}
        className="bg-panel/90 p-2.5 backdrop-blur-md"
      />
    </div>
  );
}
