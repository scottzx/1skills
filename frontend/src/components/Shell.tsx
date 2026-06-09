import { useCallback, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";

import { Sidebar } from "./Sidebar";
import { useBareMode } from "../lib/bare-mode";
import { useCommonCopy } from "../i18n";

interface ShellProps {
  children: ReactNode;
  onRefresh: () => void | Promise<void>;
  refreshPending: boolean;
}

export function Shell({ children, onRefresh, refreshPending }: ShellProps) {
  const common = useCommonCopy();
  const bareMode = useBareMode();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleMobileClose = useCallback(() => setMobileSidebarOpen(false), []);

  if (bareMode) {
    // Bare mode: render only the page content. The host provides navigation
    // via postMessage NAVIGATE and the host's own sidebar.
    return (
      <div className="app-shell app-shell--bare">
        <main className="app-main ui-scrollbar container-query">
          <div className="page-shell">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <button
        type="button"
        className="shell__hamburger"
        onClick={() => setMobileSidebarOpen((v) => !v)}
        aria-label={common.nav.overview}
      >
        <Menu size={20} />
      </button>
      <Sidebar
        onRefresh={onRefresh}
        refreshPending={refreshPending}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={handleMobileClose}
      />
      <main className="app-main ui-scrollbar container-query">
        <div className="page-shell">{children}</div>
      </main>
    </div>
  );
}
