import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MeterProps {
  value: number;
  max: number;
  /** Solid color or any CSS background value (e.g. a gradient) for the fill. */
  fill: string;
  label?: ReactNode;
  /** Right-side / header value text; omit to hide. */
  valueText?: ReactNode;
  /** `inline`: label · bar · value on one row. `stacked`: header row above bar. */
  layout?: 'inline' | 'stacked';
  /** Track height. */
  size?: 'sm' | 'md';
  className?: string;
  headerClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
  trackClassName?: string;
  fillClassName?: string;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Labeled progress bar — the HP/MP/XP and class-stat bars repeated across the
 * player card, paperdoll, and character select. Width and color are inline
 * styles because they're driven by live game data and per-class colors.
 */
export function Meter({
  value,
  max,
  fill,
  label,
  valueText,
  layout = 'inline',
  size = 'sm',
  className,
  headerClassName,
  labelClassName,
  valueClassName,
  trackClassName,
  fillClassName,
}: MeterProps) {
  const pct = (max > 0 ? clamp01(value / max) : 0) * 100;
  const track = (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-label={typeof label === 'string' ? label : undefined}
      className={cn('overflow-hidden rounded-full', size === 'md' ? 'h-2' : 'h-1.5', trackClassName ?? 'bg-black/50')}
    >
      <div className={cn('h-full rounded-full', fillClassName)} style={{ width: `${pct}%`, background: fill }} />
    </div>
  );

  if (layout === 'stacked') {
    return (
      <div className={className}>
        {(label != null || valueText != null) && (
          <div className={cn('flex justify-between', headerClassName)}>
            <span className={labelClassName}>{label}</span>
            {valueText != null && <span className={cn('tabular-nums', valueClassName)}>{valueText}</span>}
          </div>
        )}
        {track}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label != null && <span className={cn('text-muted', labelClassName)}>{label}</span>}
      <div className="flex-1">{track}</div>
      {valueText != null && (
        <span className={cn('text-right tabular-nums text-white/80', valueClassName)}>{valueText}</span>
      )}
    </div>
  );
}
