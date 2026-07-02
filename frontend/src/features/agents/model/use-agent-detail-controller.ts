import { useEffect, useRef, useState } from "react";

import type { HarnessCellState } from "./types";
import { useAgentDetailQuery, useAgentSourceStatusQuery } from "../api/queries";

interface AgentDetailMutationHandlers {
  onManageAgent: (agentRef: string) => Promise<void>;
  onToggleAgent: (agentRef: string, harness: string, currentState: HarnessCellState) => Promise<void>;
  onUpdateAgent: (agentRef: string) => Promise<void>;
  onRemoveAgent: (agentRef: string) => Promise<void>;
  onDeleteAgent: (agentRef: string) => Promise<void>;
}

export function useAgentDetailController(
  agentRef: string,
  handlers: AgentDetailMutationHandlers,
) {
  const detailQuery = useAgentDetailQuery(agentRef);
  const sourceStatusQuery = useAgentSourceStatusQuery(agentRef);
  const [actionErrorMessage, setActionErrorMessage] = useState("");
  const [isRemoveDialogOpen, setRemoveDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const isMountedRef = useRef(true);

  const detail = detailQuery.data
    ? {
        ...detailQuery.data,
        actions: {
          ...detailQuery.data.actions,
          updateStatus: sourceStatusQuery.data?.updateStatus ?? null,
        },
      }
    : null;
  const isInitialLoading = detailQuery.isPending && detail === null;
  const queryErrorMessage = detailQuery.error instanceof Error
    ? detailQuery.error.message
    : sourceStatusQuery.error instanceof Error
      ? sourceStatusQuery.error.message
      : "";

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  useEffect(() => {
    setActionErrorMessage("");
    setRemoveDialogOpen(false);
    setDeleteDialogOpen(false);
  }, [agentRef]);

  async function runAction(task: () => Promise<unknown>): Promise<boolean> {
    try {
      if (isMountedRef.current) {
        setActionErrorMessage("");
      }
      await task();
      return true;
    } catch (error) {
      if (isMountedRef.current) {
        setActionErrorMessage(error instanceof Error ? error.message : "Unable to complete the action.");
      }
      return false;
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!detail) {
      return;
    }
    const didSucceed = await runAction(() => handlers.onDeleteAgent(detail.agentRef));
    if (didSucceed && isMountedRef.current) {
      setDeleteDialogOpen(false);
    }
  }

  async function handleConfirmRemove(): Promise<void> {
    if (!detail) {
      return;
    }
    const didSucceed = await runAction(() => handlers.onRemoveAgent(detail.agentRef));
    if (didSucceed && isMountedRef.current) {
      setRemoveDialogOpen(false);
    }
  }

  return {
    detail,
    isInitialLoading,
    queryErrorMessage,
    actionErrorMessage,
    isRemoveDialogOpen,
    isDeleteDialogOpen,
    dismissActionError: () => setActionErrorMessage(""),
    onManage: () => detail && void runAction(() => handlers.onManageAgent(detail.agentRef)),
    onToggleHarness: (harness: string, currentState: HarnessCellState) =>
      detail && void runAction(() => handlers.onToggleAgent(detail.agentRef, harness, currentState)),
    onUpdate: () => detail && void runAction(() => handlers.onUpdateAgent(detail.agentRef)),
    requestRemove: () => {
      setActionErrorMessage("");
      setRemoveDialogOpen(true);
    },
    requestDelete: () => {
      setActionErrorMessage("");
      setDeleteDialogOpen(true);
    },
    setRemoveDialogOpen,
    setDeleteDialogOpen,
    handleConfirmDelete,
    handleConfirmRemove,
  };
}
