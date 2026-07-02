import { skillStatusConcept } from "../../../lib/product-language";
import type { HarnessCellState, HarnessColumn, AgentListRow, AgentsWorkspaceData } from "./types";

export interface AgentsInUseFilterState {
  search: string;
}

export interface AgentsNeedsReviewFilterState {
  search: string;
}

export interface AlignedHarnessCell {
  column: HarnessColumn;
  cell: AgentListRow["cells"][number] | null;
}

export function hasActiveAgentsInUseFilters(filters: AgentsInUseFilterState): boolean {
  return filters.search.trim() !== "";
}

export function hasActiveNeedsReviewFilters(filters: AgentsNeedsReviewFilterState): boolean {
  return filters.search.trim() !== "";
}

export function resetAgentsInUseFilters(): AgentsInUseFilterState {
  return {
    search: "",
  };
}

export function resetAgentsNeedsReviewFilters(): AgentsNeedsReviewFilterState {
  return {
    search: "",
  };
}

export function filterAgentsInUseRows(data: AgentsWorkspaceData | null, filters: AgentsInUseFilterState): AgentListRow[] {
  return selectAgentsInUseRows(data).filter((row) => matchesSearch(row, filters.search, ["enabled", "disabled"]));
}

export function filterNeedsReviewRows(data: AgentsWorkspaceData | null, filters: AgentsNeedsReviewFilterState): AgentListRow[] {
  return selectNeedsReviewRows(data).filter((row) => matchesSearch(row, filters.search, ["found"]));
}

export function countNeedsReviewRows(data: AgentsWorkspaceData | null): number {
  return selectNeedsReviewRows(data).length;
}

export function countAdoptableLocalAgentRows(data: AgentsWorkspaceData | null): number {
  return selectNeedsReviewRows(data).filter((row) => row.actions.canManage).length;
}

export function alignHarnessCells(row: AgentListRow, columns: HarnessColumn[]): AlignedHarnessCell[] {
  return columns.map((column) => ({
    column,
    cell: row.cells.find((item) => item.harness === column.harness) ?? null,
  }));
}

function selectAgentsInUseRows(data: AgentsWorkspaceData | null): AgentListRow[] {
  if (!data) {
    return [];
  }
  return data.rows.filter((row) => skillStatusConcept(row.displayStatus) === "inUse");
}

function selectNeedsReviewRows(data: AgentsWorkspaceData | null): AgentListRow[] {
  if (!data) {
    return [];
  }
  return data.rows.filter((row) => skillStatusConcept(row.displayStatus) === "needsReview");
}

function matchesSearch(
  row: AgentListRow,
  search: string,
  searchableCellStates: readonly HarnessCellState[],
): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  const harnessLabels = row.cells
    .filter((cell) => searchableCellStates.includes(cell.state))
    .map((cell) => cell.label);

  const searchHaystack = [
    row.name,
    row.description,
    ...harnessLabels,
  ].join(" ").toLowerCase();

  return searchHaystack.includes(normalizedSearch);
}
