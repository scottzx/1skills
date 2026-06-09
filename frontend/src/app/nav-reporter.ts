/**
 * Reports the current route up to the host window (1agents main app).
 *
 * The host owns the main app's URL. When the user clicks a link inside the
 * iframe (e.g. a router-driven <Link> in 1skills), the route changes here
 * first — we mirror it up via postMessage so the host's `<ModuleNav />` can
 * highlight the active item and the host URL can stay in sync.
 *
 * Only fires when the page is running inside a parent frame (i.e. the host
 * embedded us). In standalone mode there's no parent to report to, and the
 * hook becomes a no-op.
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useNavReporter(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Embed mode (custom element): dispatch a CustomEvent on the window.
    // The <skills-panel> element listens for this and re-dispatches a
    // bubbling/composed CustomEvent('navigate') on itself, which the host
    // React tree catches.
    if ((globalThis as unknown as { __SKILLS_EMBED_MODE__?: boolean }).__SKILLS_EMBED_MODE__ === true) {
      window.dispatchEvent(
        new CustomEvent("skills-navigate", { detail: { path: pathname } }),
      );
      return;
    }

    if (window.parent === window) return; // standalone — no parent
    try {
      // Always report the bare path (e.g. "/skills/review"), never the
      // hash or the iframe mount prefix. The host's manifest links use
      // bare paths too, so this keeps active-highlighting consistent.
      window.parent.postMessage(
        { type: "NAV_CHANGE", path: pathname },
        "*",
      );
    } catch {
      // ignore — some embedded contexts restrict postMessage
    }
  }, [pathname]);
}
