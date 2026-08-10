/**
 * The four official breakpoints. This registry is the canonical numeric manifest;
 * `--bp-*` declarations in styles/tokens.css are validated mirrors for CSS documentation.
 *
 * CSS media queries cannot read custom properties, so the pixel values are duplicated
 * there by necessity. This module is the single source of truth for JavaScript, so a
 * component never invents its own threshold.
 */
export const BREAKPOINTS = {
  /** Detail panel is docked above this width and becomes a modal drawer at or below it. */
  detail: 1380,
  /** Context sidebar collapses. */
  context: 1180,
  /** Multi-column layouts fold into a single column. */
  columns: 980,
  /** Mobile: primary navigation moves to the bottom bar. */
  mobile: 760,
} as const;

/**
 * Feature-specific thresholds that remain registered instead of silently becoming a
 * second breakpoint system. They preserve current responsive behavior until a product
 * decision approves consolidation.
 */
export const BREAKPOINT_EXCEPTIONS = {
  settings: 560,
  commandCenter: 600,
  densePlanner: 1100,
  nutrition: 1120,
  work: 1200,
  nutritionWide: 1280,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** `matchMedia` query matching viewports at or below the given breakpoint. */
export function maxWidthQuery(name: BreakpointName): string {
  return `(max-width: ${BREAKPOINTS[name]}px)`;
}
