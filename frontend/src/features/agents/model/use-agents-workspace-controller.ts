import { useCallback, useEffect, useState } from "react";

import { usePendingRegistry } from "../../../lib/async/pending-registry";
import {
  cellActionKey,
  type BulkAgentsAction,
  type CellActionKey,
  type StructuralAgentAction,
} from "./pending";
import type { HarnessCell, HarnessCellState, AgentListRow } from "./types";
import type {
  MultiSelectAction,
  SetAllHarnessesFailure,
  SetAllHarnessesResult,
  SetAllHarnessesTarget,
  AgentsWorkspaceContextValue,
} from "./workspace-context";
import {
  useDeleteAgentMutation,
  useManageAgentMutation,
  useAgentsListQuery,
  useToggleAgentMutation,
  useUnmanageAgentMutation,
} from "../api/queries";
import { useAgentWorkspaceSelection, type AgentsWorkspaceTab } from "./use-agent-workspace-selection";

export interface AgentsWorkspaceController {
  context: AgentsWorkspaceContextValue;
  activeTab: AgentsWorkspaceTab;
  selectedAgentRef: string | null;
  isDesktopDetailOpen: boolean;
  actionErrorMessage: string;
  queryErrorMessage: string;
  closeSelectedAgent: () => void;
  handleManageAgent: (agentRef: string) => Promise<void>;
  handleToggleAgent: (agentRef: string, harness: string, currentState: HarnessCellState) => Promise<void>;
  handleUpdateAgent: (agentRef: string) => Promise<void>;
  handleRemoveAgent: (agentRef: string) => Promise<void>;
  handleDeleteAgent: (agentRef: string) => Promise<void>;
  dismissActionError: () => void;
}

export function useAgentsWorkspaceController(): AgentsWorkspaceController {
  const listQuery = useAgentsListQuery();
  const toggleMutation = useToggleAgentMutation();
  const manageMutation = useManageAgentMutation();
  const removeMutation = useUnmanageAgentMutation();
  const deleteMutation = useDeleteAgentMutation();

  const [actionErrorMessage, setActionErrorMessage] = useState("");
  const toggleRegistry = usePendingRegistry<CellActionKey>();
  const [pendingStructuralActions, setPendingStructuralActions] = useState<Map<string, StructuralAgentAction>>(
    () => new Map(),
  );
  const [pendingBulkAction, setPendingBulkAction] = useState<BulkAgentsAction | null>(null);
  const [multiSelectedRefs, setMultiSelectedRefs] = useState<Set<string>>(() => new Set());
  const [multiSelectPending, setMultiSelectPending] = useState<MultiSelectAction | null>(null);

  const data = listQuery.data ?? null;
  const hasData = data !== null;
  const isInitialLoading = listQuery.isPending && !hasData;
  const queryErrorMessage = listQuery.error instanceof Error ? listQuery.error.message : "";
  const status: "loading" | "ready" | "error" = isInitialLoading
    ? "loading"
    : hasData
      ? "ready"
      : queryErrorMessage
        ? "error"
        : "loading";
  const {
    activeTab,
    selectedAgentRef,
    isDesktopDetailOpen,
    closeSelectedAgent,
    handleOpenAgent,
    updateSelectedAgentRef,
  } = useAgentWorkspaceSelection(data);

  function setPendingStructuralAction(agentRef: string, action: StructuralAgentAction): void {
    setPendingStructuralActions((current) => {
      if (current.get(agentRef) === action) {
        return current;
      }
      const next = new Map(current);
      next.set(agentRef, action);
      return next;
    });
  }

  function clearPendingStructuralAction(agentRef: string): void {
    setPendingStructuralActions((current) => {
      if (!current.has(agentRef)) {
        return current;
      }
      const next = new Map(current);
      next.delete(agentRef);
      return next;
    });
  }

  async function runToggleAgent(
    agentRef: string,
    harness: string,
    currentState: HarnessCellState,
    reportError: boolean,
  ): Promise<void> {
    const nextState: HarnessCellState = currentState === "enabled" ? "disabled" : "enabled";
    const key = cellActionKey(agentRef, harness);
    if (reportError) {
      setActionErrorMessage("");
    }
    try {
      await toggleRegistry.run(key, () =>
        toggleMutation.mutateAsync({ agentRef, harness, nextState }),
      );
    } catch (error) {
      if (reportError) {
        setActionErrorMessage(error instanceof Error ? error.message : "Unable to toggle the agent.");
      }
      throw error;
    }
  }

  async function runStructuralAction(
    agentRef: string,
    action: StructuralAgentAction,
    task: () => Promise<unknown>,
    reportError: boolean,
    onSuccess?: () => void,
  ): Promise<void> {
    setPendingStructuralAction(agentRef, action);
    if (reportError) {
      setActionErrorMessage("");
    }
    try {
      await task();
      onSuccess?.();
    } catch (error) {
      if (reportError) {
        setActionErrorMessage(
          error instanceof Error ? error.message : "Unable to complete the requested action.",
        );
      }
      throw error;
    } finally {
      clearPendingStructuralAction(agentRef);
    }
  }

  async function handleToggleAgent(
    agentRef: string,
    harness: string,
    currentState: HarnessCellState,
  ): Promise<void> {
    await runToggleAgent(agentRef, harness, currentState, false);
  }

  async function handleManageAgent(agentRef: string): Promise<void> {
    await runStructuralAction(
      agentRef,
      "manage",
      () => manageMutation.mutateAsync({ agentRef }),
      false,
    );
  }

  async function handleManageAgentFromList(agentRef: string): Promise<void> {
    await runStructuralAction(
      agentRef,
      "manage",
      () => manageMutation.mutateAsync({ agentRef }),
      true,
    );
  }

  async function handleToggleAgentFromList(
    agentRef: string,
    harness: string,
    currentState: HarnessCellState,
  ): Promise<void> {
    await runToggleAgent(agentRef, harness, currentState, true);
  }

  async function handleManageAll(): Promise<void> {
    if (!data) {
      return;
    }
    const adoptable = data.rows.filter((row) => row.actions.canManage);
    if (adoptable.length === 0) {
      return;
    }
    setPendingBulkAction("manage-all");
    setActionErrorMessage("");
    try {
      await Promise.all(adoptable.map((row) => manageMutation.mutateAsync({ agentRef: row.agentRef })));
    } catch (error) {
      setActionErrorMessage(error instanceof Error ? error.message : "Unable to manage all agents.");
      throw error;
    } finally {
      setPendingBulkAction(null);
    }
  }

  // No source-driven update path for agents yet; kept for interface parity.
  async function handleUpdateAgent(_agentRef: string): Promise<void> {
    void _agentRef;
  }

  async function handleDeleteAgent(agentRef: string): Promise<void> {
    await runStructuralAction(
      agentRef,
      "delete",
      () => deleteMutation.mutateAsync({ agentRef }),
      false,
      () => updateSelectedAgentRef(null, true),
    );
  }

  async function handleDeleteAgentFromList(agentRef: string): Promise<void> {
    await runStructuralAction(
      agentRef,
      "delete",
      () => deleteMutation.mutateAsync({ agentRef }),
      true,
      () => updateSelectedAgentRef(null, true),
    );
  }

  async function handleRemoveAgent(agentRef: string): Promise<void> {
    await runStructuralAction(
      agentRef,
      "unmanage",
      () => removeMutation.mutateAsync({ agentRef }),
      false,
      () => updateSelectedAgentRef(null, true),
    );
  }

  async function handleRemoveAgentFromList(agentRef: string): Promise<void> {
    await runStructuralAction(
      agentRef,
      "unmanage",
      () => removeMutation.mutateAsync({ agentRef }),
      true,
      () => updateSelectedAgentRef(null, true),
    );
  }

  function handleToggleCell(row: AgentListRow, cell: HarnessCell): void {
    void handleToggleAgentFromList(row.agentRef, cell.harness, cell.state);
  }

  const toggleMultiSelect = useCallback((agentRef: string) => {
    setMultiSelectedRefs((current) => {
      const next = new Set(current);
      if (next.has(agentRef)) {
        next.delete(agentRef);
      } else {
        next.add(agentRef);
      }
      return next;
    });
  }, []);

  const clearMultiSelect = useCallback(() => {
    setMultiSelectedRefs((current) => (current.size === 0 ? current : new Set()));
  }, []);

  // Drop selection when a previously selected row leaves the dataset.
  useEffect(() => {
    if (!data || multiSelectedRefs.size === 0) {
      return;
    }
    const available = new Set(data.rows.map((row) => row.agentRef));
    let changed = false;
    const next = new Set<string>();
    for (const ref of multiSelectedRefs) {
      if (available.has(ref)) {
        next.add(ref);
      } else {
        changed = true;
      }
    }
    if (changed) {
      setMultiSelectedRefs(next);
    }
  }, [data, multiSelectedRefs]);

  async function runMultiSelect(
    action: MultiSelectAction,
    task: (rows: AgentListRow[]) => Promise<unknown>,
  ): Promise<void> {
    if (multiSelectedRefs.size === 0 || !data) {
      return;
    }
    const rows = data.rows.filter((row) => multiSelectedRefs.has(row.agentRef));
    if (rows.length === 0) {
      return;
    }
    setMultiSelectPending(action);
    setActionErrorMessage("");
    try {
      await task(rows);
      setMultiSelectedRefs(new Set());
    } catch (error) {
      setActionErrorMessage(error instanceof Error ? error.message : "Unable to complete the bulk action.");
      throw error;
    } finally {
      setMultiSelectPending(null);
    }
  }

  async function handleMultiSelectEnableAll(): Promise<void> {
    await runMultiSelect("enable-all", async (rows) => {
      const tasks: Promise<unknown>[] = [];
      for (const row of rows) {
        for (const cell of row.cells) {
          if (cell.state === "disabled") {
            tasks.push(toggleMutation.mutateAsync({ agentRef: row.agentRef, harness: cell.harness, nextState: "enabled" }));
          }
        }
      }
      await Promise.all(tasks);
    });
  }

  async function handleMultiSelectDisableAll(): Promise<void> {
    await runMultiSelect("disable-all", async (rows) => {
      const tasks: Promise<unknown>[] = [];
      for (const row of rows) {
        for (const cell of row.cells) {
          if (cell.state === "enabled") {
            tasks.push(toggleMutation.mutateAsync({ agentRef: row.agentRef, harness: cell.harness, nextState: "disabled" }));
          }
        }
      }
      await Promise.all(tasks);
    });
  }

  async function handleMultiSelectDelete(): Promise<void> {
    await runMultiSelect("delete", async (rows) => {
      await Promise.all(rows.map((row) => deleteMutation.mutateAsync({ agentRef: row.agentRef })));
    });
  }

  async function setAgentAllHarnesses(
    row: AgentListRow,
    target: SetAllHarnessesTarget,
  ): Promise<SetAllHarnessesResult> {
    const targets = row.cells.filter((cell) => cell.interactive && cell.state !== target);
    if (targets.length === 0) {
      return { succeeded: [], failed: [] };
    }
    // Fan out one enable/disable per harness (agents has no bulk set-harnesses
    // endpoint) and mark each flipped cell pending so per-cell affordances on
    // the matrix + board match reality while the requests are in flight.
    const outcomes = await Promise.all(
      targets.map(async (cell): Promise<{ harness: string; error: Error | null }> => {
        const key = cellActionKey(row.agentRef, cell.harness);
        try {
          await toggleRegistry.run(key, () =>
            toggleMutation.mutateAsync({ agentRef: row.agentRef, harness: cell.harness, nextState: target }),
          );
          return { harness: cell.harness, error: null };
        } catch (error) {
          const reason = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
          return { harness: cell.harness, error: reason };
        }
      }),
    );
    const succeeded = outcomes.filter((o) => o.error === null).map((o) => o.harness);
    const failed: SetAllHarnessesFailure[] = outcomes
      .filter((o): o is { harness: string; error: Error } => o.error !== null)
      .map((o) => ({ harness: o.harness, error: o.error }));
    return { succeeded, failed };
  }

  async function handleSetAgentAllHarnesses(
    agentRef: string,
    target: SetAllHarnessesTarget,
  ): Promise<SetAllHarnessesResult> {
    setActionErrorMessage("");
    const row = data?.rows.find((candidate) => candidate.agentRef === agentRef);
    if (!row) {
      return { succeeded: [], failed: [] };
    }
    const result = await setAgentAllHarnesses(row, target);
    if (result.failed.length > 0) {
      setActionErrorMessage(formatSingleAgentFailureMessage(row.name, target, result.failed));
    }
    return result;
  }

  async function handleSetManyAgentsAllHarnesses(
    agentRefs: string[],
    target: SetAllHarnessesTarget,
  ): Promise<Map<string, SetAllHarnessesResult>> {
    setActionErrorMessage("");
    const refSet = new Set(agentRefs);
    const rows = data?.rows.filter((row) => refSet.has(row.agentRef)) ?? [];
    if (rows.length === 0) {
      return new Map();
    }
    const entries = await Promise.all(
      rows.map(async (row): Promise<[string, SetAllHarnessesResult]> => {
        const result = await setAgentAllHarnesses(row, target);
        return [row.agentRef, result];
      }),
    );
    const byRef = new Map(entries);
    const failingRows = rows
      .map((row) => ({ row, result: byRef.get(row.agentRef) }))
      .filter((entry): entry is { row: AgentListRow; result: SetAllHarnessesResult } =>
        Boolean(entry.result && entry.result.failed.length > 0),
      );
    if (failingRows.length > 0) {
      setActionErrorMessage(formatMultiAgentFailureMessage(failingRows, target));
    }
    return byRef;
  }

  const context: AgentsWorkspaceContextValue = {
    data,
    hasData,
    isInitialLoading,
    status,
    errorMessage: actionErrorMessage || (hasData ? queryErrorMessage : ""),
    pendingToggleKeys: toggleRegistry.pendingKeys,
    pendingStructuralActions,
    pendingBulkAction,
    selectedAgentRef,
    multiSelectedRefs,
    multiSelectPending,
    onManageAll: () => void handleManageAll(),
    onManageAgent: handleManageAgentFromList,
    onOpenAgent: handleOpenAgent,
    onToggleCell: handleToggleCell,
    onToggleMultiSelect: toggleMultiSelect,
    onClearMultiSelect: clearMultiSelect,
    onMultiSelectEnableAll: handleMultiSelectEnableAll,
    onMultiSelectDisableAll: handleMultiSelectDisableAll,
    onMultiSelectDelete: handleMultiSelectDelete,
    onSetAgentAllHarnesses: handleSetAgentAllHarnesses,
    onSetManyAgentsAllHarnesses: handleSetManyAgentsAllHarnesses,
    onUpdateAgent: handleUpdateAgent,
    onRemoveAgent: handleRemoveAgentFromList,
    onDeleteAgent: handleDeleteAgentFromList,
  };

  return {
    context,
    activeTab,
    selectedAgentRef,
    isDesktopDetailOpen,
    actionErrorMessage,
    queryErrorMessage,
    closeSelectedAgent,
    handleManageAgent,
    handleToggleAgent,
    handleUpdateAgent,
    handleRemoveAgent,
    handleDeleteAgent,
    dismissActionError: () => setActionErrorMessage(""),
  };
}

function formatSingleAgentFailureMessage(
  name: string,
  target: SetAllHarnessesTarget,
  failures: SetAllHarnessesFailure[],
): string {
  const verb = target === "enabled" ? "enable" : "disable";
  const harnesses = failures.map((failure) => failure.harness).join(", ");
  return `Unable to ${verb} ${name} on ${harnesses}.`;
}

function formatMultiAgentFailureMessage(
  failingRows: Array<{ row: AgentListRow; result: SetAllHarnessesResult }>,
  target: SetAllHarnessesTarget,
): string {
  const verb = target === "enabled" ? "enable" : "disable";
  if (failingRows.length === 1) {
    const { row, result } = failingRows[0];
    return formatSingleAgentFailureMessage(row.name, target, result.failed);
  }
  const names = failingRows.map((entry) => entry.row.name).join(", ");
  return `Unable to ${verb} every harness for ${failingRows.length} agents: ${names}.`;
}
