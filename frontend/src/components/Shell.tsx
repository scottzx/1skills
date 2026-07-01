import { type ReactNode } from "react";

import { TopNav } from "./TopNav";
import { useBareMode } from "../lib/bare-mode";

interface ShellProps {
  children: ReactNode;
  onRefresh: () => void | Promise<void>;
  refreshPending: boolean;
}

/**
 * App chrome — a project-page-style top navigation (breadcrumb + two-level
 * tabs) over the scrolling content pane. Used in both standalone and embedded
 * (bare) modes; the sidebar has been retired in favor of TopNav so the module
 * reads like a 1agents host project page. Bare mode only trims the theme /
 * language toggles (the host owns those) — handled inside TopNav.
 */
export function Shell({ children, onRefresh, refreshPending }: ShellProps) {
  const bare = useBareMode();

  return (
    <div className={`skills-shell${bare ? " skills-shell--bare" : ""}`}>
      <TopNav onRefresh={onRefresh} refreshPending={refreshPending} />
      <main className="skills-shell__body ui-scrollbar container-query">
        <div className="page-shell">{children}</div>
      </main>
    </div>
  );
}
