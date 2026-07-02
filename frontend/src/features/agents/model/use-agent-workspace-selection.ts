import { useCallback, useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { skillStatusConcept } from "../../../lib/product-language";
import type { AgentListRow, AgentsWorkspaceData } from "./types";

export type AgentsWorkspaceTab = "inUse" | "needsReview";

export function useAgentWorkspaceSelection(data: AgentsWorkspaceData | null) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobileDetail = useCompactDetailLayout();
  const activeTab: AgentsWorkspaceTab = location.pathname.endsWith("/review") || location.pathname.endsWith("/unmanaged")
    ? "needsReview"
    : "inUse";
  const selectedAgentRef = searchParams.get("agent");

  const updateSelectedAgentRef = useCallback((agentRef: string | null, replace = false) => {
    const nextParams = new URLSearchParams(searchParams);
    if (agentRef) {
      nextParams.set("agent", agentRef);
    } else {
      nextParams.delete("agent");
    }
    setSearchParams(nextParams, { replace });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedAgentRef || !data) {
      return;
    }
    const stillVisibleInTab = data.rows.some((row) =>
      row.agentRef === selectedAgentRef && rowVisibleOnTab(row, activeTab),
    );
    if (!stillVisibleInTab) {
      updateSelectedAgentRef(null, true);
    }
  }, [activeTab, data, selectedAgentRef, updateSelectedAgentRef]);

  const handleOpenAgent = useCallback((agentRef: string) => {
    updateSelectedAgentRef(selectedAgentRef === agentRef ? null : agentRef);
  }, [selectedAgentRef, updateSelectedAgentRef]);

  return {
    activeTab,
    selectedAgentRef,
    isDesktopDetailOpen: Boolean(selectedAgentRef) && !isMobileDetail,
    closeSelectedAgent: () => updateSelectedAgentRef(null),
    handleOpenAgent,
    updateSelectedAgentRef,
  };
}

function rowVisibleOnTab(row: AgentListRow, tab: AgentsWorkspaceTab): boolean {
  if (tab === "needsReview") {
    return skillStatusConcept(row.displayStatus) === "needsReview";
  }
  return skillStatusConcept(row.displayStatus) === "inUse";
}

function useCompactDetailLayout(breakpointPx = 900): boolean {
  const [matches, setMatches] = useState(() => getCompactDetailLayoutMatch(breakpointPx));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setMatches(getCompactDetailLayoutMatch(breakpointPx));
      return undefined;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const update = () => setMatches(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, [breakpointPx]);

  return matches;
}

function getCompactDetailLayoutMatch(breakpointPx: number): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(`(max-width: ${breakpointPx}px)`).matches;
  }
  return window.innerWidth <= breakpointPx;
}
