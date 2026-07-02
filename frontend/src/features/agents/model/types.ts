import type {
  HarnessCell as HarnessCellDto,
  HarnessCellState as HarnessCellStateDto,
  HarnessColumn as HarnessColumnDto,
  AgentRowActionsDto,
  AgentLocation as AgentLocationDto,
  AgentStatus as AgentStatusDto,
  AgentsSummary as AgentsSummaryDto,
  AgentDetailActionsDto,
  AgentRemoveStatus as AgentRemoveStatusDto,
  AgentSourceStatusDto,
  AgentUpdateStatus as AgentUpdateStatusDto,
} from "../api/types";

export type AgentStatus = AgentStatusDto;
export type HarnessCellState = HarnessCellStateDto;
export type AgentUpdateStatus = AgentUpdateStatusDto;
export type AgentRemoveStatus = AgentRemoveStatusDto;
export type AgentsSummary = AgentsSummaryDto;
export type HarnessColumn = HarnessColumnDto;
export type HarnessCell = HarnessCellDto;
export type AgentRowActions = AgentRowActionsDto;
export type AgentLocation = AgentLocationDto;

export interface AgentListRow {
  agentRef: string;
  name: string;
  description: string;
  displayStatus: AgentStatus;
  actions: AgentRowActions;
  cells: HarnessCell[];
}

export interface AgentsWorkspaceData {
  summary: AgentsSummary;
  harnessColumns: HarnessColumn[];
  rows: AgentListRow[];
}

export interface AgentActions extends AgentDetailActionsDto {
  updateStatus: AgentSourceStatusDto["updateStatus"];
}

export interface AgentDetail {
  agentRef: string;
  name: string;
  description: string;
  displayStatus: AgentStatus;
  attentionMessage: string | null;
  actions: AgentActions;
  harnessCells: HarnessCell[];
  locations: AgentLocation[];
  sourceLinks: null;
  documentMarkdown: string | null;
}
