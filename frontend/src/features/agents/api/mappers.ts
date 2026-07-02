import type { AgentDetailDto, AgentTableRowDto, AgentsPageDto } from "./types";
import type { AgentDetail, AgentListRow, AgentsWorkspaceData } from "../model/types";

export function mapAgentsPage(dto: AgentsPageDto): AgentsWorkspaceData {
  return {
    summary: dto.summary,
    harnessColumns: dto.harnessColumns,
    rows: dto.rows.map(mapAgentRow),
  };
}

export function mapAgentDetail(dto: AgentDetailDto): AgentDetail {
  return {
    agentRef: dto.agentRef,
    name: dto.name,
    description: dto.description,
    displayStatus: dto.displayStatus,
    attentionMessage: dto.attentionMessage,
    actions: {
      ...dto.actions,
      updateStatus: null,
    },
    harnessCells: dto.harnessCells,
    locations: dto.locations,
    sourceLinks: null,
    documentMarkdown: dto.documentMarkdown,
  };
}

function mapAgentRow(dto: AgentTableRowDto): AgentListRow {
  return {
    agentRef: dto.agentRef,
    name: dto.name,
    description: dto.description,
    displayStatus: dto.displayStatus,
    actions: dto.actions,
    cells: dto.cells,
  };
}
