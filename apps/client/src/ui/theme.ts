/**
 * Semantic stat colors for inline styles (dynamic bar widths, gradients, SVG
 * fills) where a Tailwind class can't reach. The values are `var()` references
 * to the `@theme` tokens in index.css, so index.css stays the single source of
 * truth — class names (`text-positive`) and these strings resolve to the same
 * color. For per-class colors keep using the class definition's `color`.
 */
export const STAT_COLORS = {
  positive: 'var(--color-positive)',
  negative: 'var(--color-negative)',
  mana: 'var(--color-mana)',
  cast: 'var(--color-cast)',
  xpTip: 'var(--color-xp-tip)',
  text: 'var(--color-text)',
} as const;
