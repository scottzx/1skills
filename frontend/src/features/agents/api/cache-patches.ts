import type { HarnessCell, AgentDetailDto, AgentsPageDto } from "./types";
import type { HarnessCellState } from "../model/types";

export function patchAgentsListToggle(
  data: AgentsPageDto,
  agentRef: string,
  harness: string,
  nextState: HarnessCellState,
): AgentsPageDto {
  return {
    ...data,
    rows: data.rows.map((row) =>
      row.agentRef !== agentRef
        ? row
        : {
            ...row,
            cells: row.cells.map((cell) =>
              cell.harness !== harness ? cell : { ...cell, state: nextState },
            ),
          },
    ),
  };
}

export function patchAgentDetailToggle(
  data: AgentDetailDto,
  harness: string,
  nextState: HarnessCellState,
): AgentDetailDto {
  return {
    ...data,
    harnessCells: data.harnessCells.map((cell) =>
      cell.harness !== harness ? cell : { ...cell, state: nextState },
    ),
  };
}

export function getListCellState(
  data: AgentsPageDto | undefined,
  agentRef: string,
  harness: string,
): HarnessCellState | null {
  return findHarnessCell(
    data?.rows.find((row) => row.agentRef === agentRef)?.cells,
    harness,
  )?.state ?? null;
}

export function getDetailCellState(
  data: AgentDetailDto | undefined,
  harness: string,
): HarnessCellState | null {
  return findHarnessCell(data?.harnessCells, harness)?.state ?? null;
}

export function removeAgentFromList(data: AgentsPageDto, agentRef: string): AgentsPageDto {
  const removedRow = data.rows.find((row) => row.agentRef === agentRef);
  if (!removedRow) {
    return data;
  }

  return {
    ...data,
    summary: {
      ...data.summary,
      managed: removedRow.displayStatus === "Managed" ? Math.max(0, data.summary.managed - 1) : data.summary.managed,
      unmanaged: removedRow.displayStatus === "Unmanaged" ? Math.max(0, data.summary.unmanaged - 1) : data.summary.unmanaged,
    },
    rows: data.rows.filter((row) => row.agentRef !== agentRef),
  };
}

function findHarnessCell(
  cells: HarnessCell[] | undefined,
  harness: string,
): HarnessCell | undefined {
  return cells?.find((cell) => cell.harness === harness);
}
