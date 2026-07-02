import type { components } from "../../../api/generated";

export type EnableAgentRequest = components["schemas"]["EnableAgentRequest"];
export type DisableAgentRequest = components["schemas"]["DisableAgentRequest"];
export type OkResponse = components["schemas"]["OkResponse"];
export type AgentStatus = components["schemas"]["AgentTableRowResponse"]["displayStatus"];
export type HarnessCellState = components["schemas"]["AgentHarnessCellResponse"]["state"];
export type AgentUpdateStatus = NonNullable<components["schemas"]["AgentSourceStatusResponse"]["updateStatus"]>;
export type AgentRemoveStatus = NonNullable<
  components["schemas"]["AgentDetailActionsResponse"]["stopManagingStatus"]
>;
export type AgentsSummary = components["schemas"]["AgentsSummaryResponse"];
export type HarnessColumn = components["schemas"]["AgentHarnessColumnResponse"];
export type AgentRowActionsDto = components["schemas"]["AgentRowActionsResponse"];
export type HarnessCell = components["schemas"]["AgentHarnessCellResponse"];
export type AgentTableRowDto = components["schemas"]["AgentTableRowResponse"];
export type AgentsPageDto = components["schemas"]["AgentsPageResponse"];
export type AgentDetailActionsDto = components["schemas"]["AgentDetailActionsResponse"];
export type AgentSourceStatusDto = components["schemas"]["AgentSourceStatusResponse"];
export type AgentLocation = components["schemas"]["AgentLocationResponse"];
export type AgentDetailDto = components["schemas"]["AgentDetailResponse"];
