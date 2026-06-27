import { useHudStore } from '../../../../store/useHudStore';
import { useQualityStore, QUALITY_LABEL, type QualityTier } from '../../../../store/useQualityStore';
import { useFullscreen } from '../../../../hooks/useFullscreen';
import { AudioControl } from '../../../AudioControl';
import { cn } from '@/lib/utils';
import {
  resetCameraHeightScrollOffset,
  resetCameraZoom,
} from '../../../../store/cameraControl';

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

const QUALITY_TIERS: QualityTier[] = ['low', 'medium', 'high'];

/** Graphics quality picker — scales resolution, shadows and lights. The choice
 *  is persisted, so it sticks across sessions. */
function QualityRow() {
  const tier = useQualityStore((s) => s.tier);
  const setTier = useQualityStore((s) => s.setTier);
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm text-text">Graphics quality</span>
        <span className="block text-[11px] text-muted">Lower it if the game runs slow</span>
      </span>
      <div className="flex shrink-0 gap-1 rounded-lg bg-black/30 p-0.5">
        {QUALITY_TIERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTier(t)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs transition-colors',
              tier === t ? 'bg-gold text-black' : 'text-muted hover:text-text',
            )}
          >
            {QUALITY_LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Camera control mode picker (1 = zoom on scroll, 2 = height on scroll). */
function CameraControlRow() {
  const mode = useHudStore((s) => s.cameraControlMode);
  const setMode = useHudStore((s) => s.setCameraControlMode);
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/5">
      <span className="min-w-0">
        <span className="block text-sm text-text">Camera control</span>
        <span className="block text-[11px] text-muted">1: Scroll zooms · 2: Scroll tilts</span>
      </span>
      <div className="flex shrink-0 gap-1 rounded-lg bg-black/30 p-0.5">
        {([1, 2] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              resetCameraZoom();
              resetCameraHeightScrollOffset();
            }}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
              mode === m ? 'bg-gold text-black' : 'text-muted hover:text-text',
            )}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Settings — the HUD preferences (volume, graphics quality, camera mode, chat /
 * HUD / perf toggles). Lifted out of the old `SettingsPanel` dialog into the town
 * sidebar; bound to the reactive stores so toggles update the live UI immediately.
 */
export function SettingsContent() {
  const showPerf = useHudStore((s) => s.showPerf);
  const setShowPerf = useHudStore((s) => s.setShowPerf);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-sm text-text">Volume</span>
          <span className="block text-[11px] text-muted">Master volume · mute</span>
        </span>
        <AudioControl />
      </div>
      <QualityRow />
      <CameraControlRow />
      <ToggleRow
        label="Fullscreen"
        hint="Fill the screen with the game"
        checked={isFullscreen}
        onChange={toggleFullscreen}
      />
      <ToggleRow
        label="Show performance stats"
        hint="FPS / frame time / draw calls (top-right)"
        checked={showPerf}
        onChange={setShowPerf}
      />
    </div>
  );
}
