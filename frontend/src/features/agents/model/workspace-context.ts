import { useOutletContext } from "react-router-dom";

import type { MultiSelectAction } from "../../../components/BulkActionBar";
import type { BulkAgentsAction, CellActionKey, StructuralAgentAction } from "./pending";
import type { HarnessCell, AgentListRow, AgentsWorkspaceData } from "./types";

export type { MultiSelectAction };

export type SetAllHarnessesTarget = "enabled" | "disabled";

export interface SetAllHarnessesFailure {
  harness: string;
  error: Error;
}

export interface SetAllHarnessesResult {
  succeeded: string[];
  failed: SetAllHarnessesFailure[];
}

export interface AgentsWorkspaceContextValue {
  data: AgentsWorkspaceData | null;
  hasData: boolean;
  isInitialLoading: boolean;
  status: "loading" | "ready" | "error";
  errorMessage: string;
  pendingToggleKeys: ReadonlySet<CellActionKey>;
  pendingStructuralActions: ReadonlyMap<string, StructuralAgentAction>;
  pendingBulkAction: BulkAgentsAction | null;
  selectedAgentRef: string | null;
  multiSelectedRefs: ReadonlySet<string>;
  multiSelectPending: MultiSelectAction | null;
  onManageAll: () => void;
  onManageAgent: (agentRef: string) => Promise<void>;
  onOpenAgent: (agentRef: string) => void;
  onToggleCell: (row: AgentListRow, cell: HarnessCell) => void;
  onToggleMultiSelect: (agentRef: string) => void;
  onClearMultiSelect: () => void;
  onMultiSelectEnableAll: () => Promise<void>;
  onMultiSelectDisableAll: () => Promise<void>;
  onMultiSelectDelete: () => Promise<void>;
  onSetAgentAllHarnesses: (agentRef: string, target: SetAllHarnessesTarget) => Promise<SetAllHarnessesResult>;
  onSetManyAgentsAllHarnesses: (
    agentRefs: string[],
    target: SetAllHarnessesTarget,
  ) => Promise<Map<string, SetAllHarnessesResult>>;
  onUpdateAgent: (agentRef: string) => Promise<void>;
  onRemoveAgent: (agentRef: string) => Promise<void>;
  onDeleteAgent: (agentRef: string) => Promise<void>;
}

export function useAgentsWorkspace(): AgentsWorkspaceContextValue {
  return useOutletContext<AgentsWorkspaceContextValue>();
}
