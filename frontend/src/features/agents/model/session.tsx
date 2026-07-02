import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import {
  resetAgentsNeedsReviewFilters,
  resetAgentsInUseFilters,
  type AgentsNeedsReviewFilterState,
  type AgentsInUseFilterState,
} from "./selectors";

type AgentsWorkspaceTab = "inUse" | "needsReview";

interface AgentsWorkspaceSessionContextValue {
  inUseFilters: AgentsInUseFilterState;
  needsReviewFilters: AgentsNeedsReviewFilterState;
  inUseScrollTop: number | null;
  needsReviewScrollTop: number | null;
  updateInUseFilters: (partial: Partial<AgentsInUseFilterState>) => void;
  updateNeedsReviewFilters: (partial: Partial<AgentsNeedsReviewFilterState>) => void;
  resetInUseFilters: () => void;
  resetNeedsReviewFilters: () => void;
  setScrollPosition: (tab: AgentsWorkspaceTab, scrollTop: number) => void;
}

const AgentsWorkspaceSessionContext = createContext<AgentsWorkspaceSessionContextValue | null>(null);

export function AgentsWorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const [inUseFilters, setInUseFilters] = useState<AgentsInUseFilterState>(() => resetAgentsInUseFilters());
  const [needsReviewFilters, setNeedsReviewFilters] = useState<AgentsNeedsReviewFilterState>(() => resetAgentsNeedsReviewFilters());
  const [inUseScrollTop, setInUseScrollTop] = useState<number | null>(null);
  const [needsReviewScrollTop, setNeedsReviewScrollTop] = useState<number | null>(null);

  const updateInUseFilters = useCallback((partial: Partial<AgentsInUseFilterState>) => {
    setInUseFilters((current) => ({ ...current, ...partial }));
  }, []);

  const updateNeedsReviewFilters = useCallback((partial: Partial<AgentsNeedsReviewFilterState>) => {
    setNeedsReviewFilters((current) => ({ ...current, ...partial }));
  }, []);

  const resetInUse = useCallback(() => {
    setInUseFilters(resetAgentsInUseFilters());
  }, []);

  const resetNeedsReview = useCallback(() => {
    setNeedsReviewFilters(resetAgentsNeedsReviewFilters());
  }, []);

  const setScrollPosition = useCallback((tab: AgentsWorkspaceTab, scrollTop: number) => {
    if (tab === "inUse") {
      setInUseScrollTop(scrollTop);
      return;
    }
    setNeedsReviewScrollTop(scrollTop);
  }, []);

  const value = useMemo<AgentsWorkspaceSessionContextValue>(() => ({
    inUseFilters,
    needsReviewFilters,
    inUseScrollTop,
    needsReviewScrollTop,
    updateInUseFilters,
    updateNeedsReviewFilters,
    resetInUseFilters: resetInUse,
    resetNeedsReviewFilters: resetNeedsReview,
    setScrollPosition,
  }), [
    needsReviewFilters,
    needsReviewScrollTop,
    inUseFilters,
    inUseScrollTop,
    resetNeedsReview,
    resetInUse,
    setScrollPosition,
    updateNeedsReviewFilters,
    updateInUseFilters,
  ]);

  return (
    <AgentsWorkspaceSessionContext.Provider value={value}>
      {children}
    </AgentsWorkspaceSessionContext.Provider>
  );
}

export function useAgentsInUseSession() {
  const context = useAgentsWorkspaceSession();
  return {
    filters: context.inUseFilters,
    updateFilters: context.updateInUseFilters,
    resetFilters: context.resetInUseFilters,
  };
}

export function useAgentsNeedsReviewSession() {
  const context = useAgentsWorkspaceSession();
  return {
    filters: context.needsReviewFilters,
    updateFilters: context.updateNeedsReviewFilters,
    resetFilters: context.resetNeedsReviewFilters,
  };
}

export function useAgentsTabScroll(
  tab: AgentsWorkspaceTab,
  ready: boolean,
  scrollRef: RefObject<HTMLElement | null>,
) {
  const context = useAgentsWorkspaceSession();
  const restoredRef = useRef(false);
  const targetScrollTop = tab === "inUse" ? context.inUseScrollTop : context.needsReviewScrollTop;

  useLayoutEffect(() => {
    if (!ready || restoredRef.current || targetScrollTop === null) {
      return;
    }
    if (!scrollRef.current) {
      return;
    }
    restoredRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: targetScrollTop, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready, scrollRef, targetScrollTop]);

  useLayoutEffect(() => {
    restoredRef.current = false;
  }, [tab]);

  useLayoutEffect(() => {
    return () => {
      const nextScrollTop = scrollRef.current?.scrollTop ?? 0;
      context.setScrollPosition(tab, nextScrollTop);
    };
  }, [context, scrollRef, tab]);
}

function useAgentsWorkspaceSession(): AgentsWorkspaceSessionContextValue {
  const context = useContext(AgentsWorkspaceSessionContext);
  if (!context) {
    throw new Error("Agents workspace session context is not available.");
  }
  return context;
}
