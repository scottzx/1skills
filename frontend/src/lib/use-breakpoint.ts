import { useEffect, useState } from "react";

import { BREAKPOINTS, type BreakpointKey, type BreakpointSide } from "./breakpoints";

/**
 * Returns true when the viewport matches the breakpoint.
 *
 * - `useBreakpoint("compact")` → true when viewport ≤ 600px
 * - `useBreakpoint("tablet", "min")` → true when viewport ≥ 900px
 *
 * SSR-safe: defaults to `false` when `window` or `matchMedia` is absent.
 * Subscribes to `change` events so a window resize re-evaluates the result.
 *
 * NOTE: this hook measures the *viewport*. For iframe-embedded scenarios
 * where the host controls the slot width, prefer CSS container queries via
 * `<Container>` (see `components/layout/Container.tsx`).
 */
export function useBreakpoint(
  key: BreakpointKey,
  side: BreakpointSide = "max",
): boolean {
  const query = `(${side}-width: ${BREAKPOINTS[key]}px)`;
  const [matches, setMatches] = useState<boolean>(() => initialMatch(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    }
    mql.addListener(update);
    return () => mql.removeListener(update);
  }, [query]);

  return matches;
}

function initialMatch(query: string): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(query).matches;
  }
  // Fallback for environments without matchMedia (jsdom pre-config, etc.).
  const match = /(\d+)px/.exec(query);
  if (!match) return false;
  const px = Number(match[1]);
  const isMax = query.includes("max-width");
  return isMax ? window.innerWidth <= px : window.innerWidth >= px;
}
