import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Minimal themed range slider over a native `<input type=range>` (no new dep).
 * Drives audio volume today; reusable for any numeric setting. The filled
 * portion of the track follows the value via a gold→track CSS gradient.
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ value, onValueChange, min = 0, max = 1, step = 0.01, className, style, ...props }, ref) => {
    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onValueChange(Number.parseFloat(e.target.value))}
        className={cn(
          'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 outline-none transition focus-visible:ring-2 focus-visible:ring-gold/60',
          '[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gold [&::-webkit-slider-thumb]:shadow',
          '[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-gold',
          className,
        )}
        style={{
          background: `linear-gradient(to right, var(--color-gold) ${pct}%, rgb(255 255 255 / 0.15) ${pct}%)`,
          ...style,
        }}
        {...props}
      />
    );
  },
);
Slider.displayName = 'Slider';
