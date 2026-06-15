/**
 * Semantic stat colors for inline styles (dynamic bar widths, gradients, SVG
 * fills) where a Tailwind class can't reach. The values are `var()` references
 * to the `@theme` tokens in index.css, so index.css stays the single source of
 * truth — class names (`text-positive`) and these strings resolve to the same
 * color. (Per-class accent colors are intentionally not used in the UI.)
 */
export const STAT_COLORS = {
  positive: 'var(--color-positive)',
  negative: 'var(--color-negative)',
  mana: 'var(--color-mana)',
  cast: 'var(--color-cast)',
  xpTip: 'var(--color-xp-tip)',
  text: 'var(--color-text)',
} as const;

/** Match-team accent colors (blue = mana, red = negative) for inline use on
 *  lobby slots, the ready-check, and the end-of-match scoreboard. */
export const TEAM_COLORS = {
  blue: 'var(--color-mana)',
  red: 'var(--color-negative)',
} as const;

/** Human-readable team names. */
export const TEAM_LABELS = {
  blue: 'Blue',
  red: 'Red',
} as const;
