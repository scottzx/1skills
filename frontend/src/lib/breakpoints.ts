/**
 * Single source of truth for responsive breakpoint px values.
 *
 * The `@media` rules in CSS use these px values inline (no preprocessor
 * indirection), and the `useBreakpoint` hook reads from here. Keep in sync
 * with `--bp-*` tokens in `styles/tokens.css`.
 */
export const BREAKPOINTS = {
  /** Phones (≤ 600px): single-column lists, dialog → bottom sheet. */
  compact: 600,
  /** Tablets (601–900px): 2-col grids, sidebar → drawer, matrix compaction. */
  tablet: 900,
  /** Desktop (901–1100px): 3-col skill grid, secondary pane hidden. */
  wide: 1100,
  /** Wide desktop (≥ 1280px). Reserved — avoid creating rules that fire here. */
  extra: 1280,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

export type BreakpointSide = "max" | "min";

/**
 * Build a CSS media query string for the given breakpoint. Useful in inline
 * `<style>` blocks or for tests; not used in the hook itself (the hook
 * constructs the string inline so the bundle stays small).
 */
export function breakpointMedia(
  key: BreakpointKey,
  side: BreakpointSide = "max",
): string {
  return `(${side}-width: ${BREAKPOINTS[key]}px)`;
}
