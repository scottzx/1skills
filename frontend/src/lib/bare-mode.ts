import { useEffect, useState } from "react";

/**
 * Bare mode = "this 1skills page is loaded as a module slot inside the
 * 1agents host". Driven by `?bare=1` in the URL — set by the host's
 * `buildModuleIframeSrc` (see html/src/modules/registry.ts in the parent
 * project). When true, the host owns navigation, sidebar, and footer; we
 * switch to HashRouter and skip the local chrome.
 *
 * This module is the single source of truth. The three earlier copies at
 * main.tsx / parent-sync.ts / Shell.tsx now import from here.
 *
 * - `isBareModeNow()` for non-React code paths (run before render).
 * - `useBareMode()` for React components. Subscribes to `popstate` so a
 *   future in-app bare-mode toggle would re-render — today a no-op but
 *   keeps the contract correct.
 */
export function isBareModeNow(): boolean {
  if (typeof window === "undefined") return false;
  if ((globalThis as any).__SKILLS_EMBED_MODE__ === true) return true;
  return new URLSearchParams(window.location.search).get("bare") === "1";
}

export function useBareMode(): boolean {
  const [bare, setBare] = useState<boolean>(isBareModeNow);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onPopState = () => setBare(isBareModeNow());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return bare;
}
