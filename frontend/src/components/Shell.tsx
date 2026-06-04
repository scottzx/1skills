import { useCallback, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";

import { Sidebar } from "./Sidebar";
import { useCommonCopy } from "../i18n";

interface ShellProps {
  children: ReactNode;
  onRefresh: () => void | Promise<void>;
  refreshPending: boolean;
}

export function Shell({ children, onRefresh, refreshPending }: ShellProps) {
  const common = useCommonCopy();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleMobileClose = useCallback(() => setMobileSidebarOpen(false), []);

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
      <main className="app-main ui-scrollbar">
        <div className="page-shell">{children}</div>
      </main>
    </div>
  );
}
