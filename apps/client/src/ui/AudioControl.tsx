import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { IconButton, Slider } from './primitives';
import { cn } from '@/lib/utils';

export interface AudioControlProps {
  className?: string;
  /** Show the volume slider beside the mute button (default true). */
  showSlider?: boolean;
  /** Compact pill: icon-only at rest, the slider slides out on hover/focus.
   *  For tight spots like the menu header; the Settings panel uses the inline
   *  layout (default). */
  compact?: boolean;
}

/**
 * Self-contained audio control bound to `useAudioStore`: a mute toggle (the
 * speaker icon reflects mute/level) plus a master-volume slider.
 *
 * Two layouts share one piece of logic:
 * - **inline** (default) — icon + always-visible slider, used in the Settings panel.
 * - **compact** — a rounded pill that's just the speaker at rest and reveals the
 *   slider on hover or keyboard focus, for the menu header where space is tight.
 */
export function AudioControl({ className, showSlider = true, compact = false }: AudioControlProps) {
  const masterVolume = useAudioStore((s) => s.masterVolume);
  const muted = useAudioStore((s) => s.muted);
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume);
  const setMuted = useAudioStore((s) => s.setMuted);
  const toggleMuted = useAudioStore((s) => s.toggleMuted);

  const silent = muted || masterVolume === 0;
  const Icon = silent ? VolumeX : masterVolume < 0.5 ? Volume1 : Volume2;

  const onSlide = (v: number) => {
    setMasterVolume(v);
    // Dragging up off zero is an intent to hear — lift the mute too.
    if (muted && v > 0) setMuted(false);
  };

  const muteButton = (
    <IconButton
      icon={Icon}
      aria-label={muted ? 'Unmute' : 'Mute'}
      aria-pressed={muted}
      onClick={toggleMuted}
      className={cn(silent && 'text-muted')}
    />
  );

  if (compact) {
    // The slider area collapses to zero width via a 0fr→1fr grid track, so it
    // animates open smoothly on hover/focus and is fully hidden (and out of the
    // layout) at rest. Focus-within keeps it keyboard-reachable.
    return (
      <div
        className={cn(
          'group flex items-center rounded-full border border-white/10 bg-panel/70 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md transition-colors hover:border-white/20',
          className,
        )}
      >
        {muteButton}
        <div className="-mt-1 grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-out group-focus-within:grid-cols-[1fr] group-hover:grid-cols-[1fr]">
          <div className="overflow-hidden">
            <Slider
              aria-label="Master volume"
              value={silent ? 0 : masterVolume}
              onValueChange={onSlide}
              className="mx-2 w-24"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {muteButton}
      {showSlider && (
        <Slider
          aria-label="Master volume"
          value={silent ? 0 : masterVolume}
          onValueChange={onSlide}
          className="w-24"
        />
      )}
    </div>
  );
}
