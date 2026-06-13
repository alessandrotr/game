import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { IconButton, Slider } from './primitives';
import { cn } from '@/lib/utils';

export interface AudioControlProps {
  className?: string;
  /** Show the volume slider beside the mute button (default true). */
  showSlider?: boolean;
}

/**
 * Self-contained audio control: a mute toggle (the speaker icon reflects
 * mute/level) plus a master-volume slider, bound to `useAudioStore`. The single
 * audio UI — reused compactly on the JoinScreen and in the Settings panel.
 */
export function AudioControl({ className, showSlider = true }: AudioControlProps) {
  const masterVolume = useAudioStore((s) => s.masterVolume);
  const muted = useAudioStore((s) => s.muted);
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume);
  const setMuted = useAudioStore((s) => s.setMuted);
  const toggleMuted = useAudioStore((s) => s.toggleMuted);

  const silent = muted || masterVolume === 0;
  const Icon = silent ? VolumeX : masterVolume < 0.5 ? Volume1 : Volume2;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <IconButton
        icon={Icon}
        aria-label={muted ? 'Unmute' : 'Mute'}
        aria-pressed={muted}
        onClick={toggleMuted}
        className={cn(silent && 'text-muted')}
      />
      {showSlider && (
        <Slider
          aria-label="Master volume"
          value={silent ? 0 : masterVolume}
          onValueChange={(v) => {
            setMasterVolume(v);
            // Dragging up off zero is an intent to hear — lift the mute too.
            if (muted && v > 0) setMuted(false);
          }}
          className="w-24"
        />
      )}
    </div>
  );
}
