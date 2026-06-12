import { X } from 'lucide-react';
import { useHudStore } from '../../store/useHudStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useCameraPrefsStore } from '../../store/useCameraPrefsStore';
import { Dialog, DialogClose, DialogContent, DialogTitle, IconButton } from '../primitives';
import { cn } from '@/lib/utils';

/** A labelled on/off switch row, bound to a boolean + setter. */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/5"
    >
      <span className="min-w-0">
        <span className="block text-sm text-text">{label}</span>
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-gold' : 'bg-white/15',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

/**
 * Settings — a small modal reached from the game menu that centralizes the HUD
 * preferences (player-card density, chat visibility, hide-HUD). Bound to the
 * reactive `useHudStore` so flipping a toggle updates the live UI immediately.
 */
export function SettingsPanel() {
  const open = useSettingsStore((s) => s.open);
  const setOpen = useSettingsStore((s) => s.setOpen);

  const hidden = useHudStore((s) => s.hidden);
  const setHidden = useHudStore((s) => s.setHidden);
  const chatCollapsed = useHudStore((s) => s.chatCollapsed);
  const setChatCollapsed = useHudStore((s) => s.setChatCollapsed);
  const playerCardCompact = useHudStore((s) => s.playerCardCompact);
  const setPlayerCardCompact = useHudStore((s) => s.setPlayerCardCompact);
  const showPerf = useHudStore((s) => s.showPerf);
  const setShowPerf = useHudStore((s) => s.setShowPerf);

  const camera = useCameraPrefsStore((s) => s.prefs);
  const setLock = useCameraPrefsStore((s) => s.setLock);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm p-0" aria-describedby={undefined}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <DialogTitle className="font-display text-lg font-bold tracking-wide text-gold">Settings</DialogTitle>
          <DialogClose asChild>
            <IconButton icon={X} aria-label="Close" />
          </DialogClose>
        </div>

        <div className="p-2">
          <ToggleRow
            label="Compact player card"
            hint="Collapse the town player card to a slim bar"
            checked={playerCardCompact}
            onChange={setPlayerCardCompact}
          />
          <ToggleRow label="Hide chat" checked={chatCollapsed} onChange={setChatCollapsed} />
          <ToggleRow
            label="Hide HUD"
            hint="Press H in-game to toggle"
            checked={hidden}
            onChange={setHidden}
          />
          <ToggleRow
            label="Show performance stats"
            hint="FPS / frame time / draw calls (top-right)"
            checked={showPerf}
            onChange={setShowPerf}
          />

          {/* Camera — lock manual rotate/tilt/zoom. Synced to your account. */}
          <div className="mt-1 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Camera
          </div>
          <ToggleRow
            label="Lock tilt up"
            hint="Prevent tilting toward top-down"
            checked={camera.lockTiltUp}
            onChange={(v) => setLock('lockTiltUp', v)}
          />
          <ToggleRow
            label="Lock tilt down"
            hint="Prevent tilting to a flatter angle"
            checked={camera.lockTiltDown}
            onChange={(v) => setLock('lockTiltDown', v)}
          />
          <ToggleRow
            label="Lock rotation"
            hint="Disable left/right orbiting"
            checked={camera.lockRotation}
            onChange={(v) => setLock('lockRotation', v)}
          />
          <ToggleRow
            label="Lock zoom"
            hint="Disable mouse-wheel zoom"
            checked={camera.lockZoom}
            onChange={(v) => setLock('lockZoom', v)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
