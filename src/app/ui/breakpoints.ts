/**
 * The four official breakpoints, mirrored from `--bp-*` in styles/tokens.css.
 *
 * CSS media queries cannot read custom properties, so the pixel values are duplicated
 * there by necessity. This module is the single source of truth for JavaScript, so a
 * component never invents its own threshold.
 */
export const BREAKPOINTS = {
  /** Detail panel switches from an inline column to a modal drawer. */
  detail: 1380,
  /** Context sidebar collapses. */
  context: 1180,
  /** Multi-column layouts fold into a single column. */
  columns: 980,
  /** Mobile: primary navigation moves to the bottom bar. */
  mobile: 760,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** `matchMedia` query matching viewports at or below the given breakpoint. */
export function maxWidthQuery(name: BreakpointName): string {
  return `(max-width: ${BREAKPOINTS[name]}px)`;
}
