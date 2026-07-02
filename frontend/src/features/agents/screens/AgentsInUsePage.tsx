import { useMemo, useState } from "react";
import { Columns3, LayoutGrid, Rows3 } from "lucide-react";
import { Link } from "react-router-dom";

import { AgentActionConfirmDialog } from "../components/dialogs/AgentActionConfirmDialog";
import { FilterBar } from "../../../components/FilterBar";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { PageHeader } from "../../../components/PageHeader";
import { SelectionMenu } from "../../../components/ui/SelectionMenu";
import { ViewModeToggle, type ViewModeOption } from "../../../components/ViewModeToggle";
import { useCommonCopy } from "../../../i18n";
import { BoardView } from "../components/board/BoardView";
import { AgentsInUseList } from "../components/cards/AgentsInUseList";
import { MatrixView } from "../components/matrix/MatrixView";
import { AgentsEmptyState } from "../components/pane/AgentsEmptyState";
import { useAgentsCopy } from "../i18n";
import { useAgentsInUseSession } from "../model/session";
import {
  filterAgentsInUseRows,
  hasActiveAgentsInUseFilters,
} from "../model/selectors";
import { useInUseViewMode, type InUseViewMode } from "../model/useInUseViewMode";
import { useAgentsWorkspace } from "../model/workspace-context";
import type { AgentListRow } from "../model/types";

type InUsePillValue = "all" | "enabled" | "all-harnesses" | "off";

function countEnabledCells(row: AgentListRow): number {
  return row.cells.filter((cell) => cell.state === "enabled").length;
}

function applyPillFilter(rows: AgentListRow[], pill: InUsePillValue, harnessCount: number): AgentListRow[] {
  if (pill === "all") return rows;
  if (pill === "enabled") return rows.filter((row) => countEnabledCells(row) > 0);
  if (pill === "all-harnesses") return rows.filter((row) => countEnabledCells(row) === harnessCount && harnessCount > 0);
  if (pill === "off") return rows.filter((row) => countEnabledCells(row) === 0);
  return rows;
}

export default function AgentsInUsePage() {
  const {
    data,
    status,
    pendingToggleKeys,
    pendingStructuralActions,
    selectedAgentRef,
    multiSelectedRefs,
    onOpenAgent,
    onToggleCell,
    onToggleMultiSelect,
    onClearMultiSelect,
    onSetAgentAllHarnesses,
    onSetManyAgentsAllHarnesses,
    onRemoveAgent,
    onDeleteAgent,
    isInitialLoading,
  } = useAgentsWorkspace();
  const { filters, updateFilters, resetFilters } = useAgentsInUseSession();
  const copy = useAgentsCopy();
  const common = useCommonCopy();
  const [pill, setPill] = useState<InUsePillValue>("all");
  const [viewMode, setViewMode] = useInUseViewMode();
  const [pendingConfirm, setPendingConfirm] = useState<{
    action: "unmanage" | "delete";
    agentRef: string;
    agentName: string;
    harnessLabels: string[];
  } | null>(null);

  const baseRows = useMemo(() => filterAgentsInUseRows(data, filters), [data, filters]);

  const harnessCount = data?.harnessColumns.length ?? 0;
  // The pill filter only applies in Grid view. Board view already answers the
  // "coverage" question visually via its columns, so re-applying the pill would
  // collapse the board to a single column and invite confusion. We preserve the
  // pill state so a user flipping back to Grid keeps their prior filter.
  const rows = useMemo(
    () => (viewMode === "grid" ? applyPillFilter(baseRows, pill, harnessCount) : baseRows),
    [baseRows, pill, harnessCount, viewMode],
  );

  const pillCounts: Record<InUsePillValue, number> = useMemo(() => {
    return {
      all: baseRows.length,
      enabled: baseRows.filter((r) => countEnabledCells(r) > 0).length,
      "all-harnesses": baseRows.filter((r) => countEnabledCells(r) === harnessCount && harnessCount > 0).length,
      off: baseRows.filter((r) => countEnabledCells(r) === 0).length,
    };
  }, [baseRows, harnessCount]);
  const pillOptions = useMemo(
    () =>
      (["all", "enabled", "all-harnesses", "off"] as const).map((value) => ({
        value,
        label: pillLabel(copy, value),
        meta: pillCounts[value],
      })),
    [copy, pillCounts],
  );
  const viewModeOptions: readonly ViewModeOption<InUseViewMode>[] = useMemo(
    () => [
      { value: "grid", label: copy.inUse.viewModes.grid, icon: LayoutGrid },
      { value: "board", label: copy.inUse.viewModes.board, icon: Columns3 },
      { value: "matrix", label: copy.inUse.viewModes.matrix, icon: Rows3 },
    ],
    [copy],
  );

  const hasActiveFilters =
    hasActiveAgentsInUseFilters(filters) || (viewMode === "grid" && pill !== "all");
  const hasInUseInventory = (data?.summary.managed ?? 0) > 0;
  const isReady = status === "ready" && Boolean(data);
  const pendingConfirmAction =
    pendingConfirm === null
      ? null
      : pendingStructuralActions.get(pendingConfirm.agentRef) ?? null;

  function enabledHarnessLabels(row: AgentListRow): string[] {
    return row.cells
      .filter((cell) => cell.state === "enabled")
      .map((cell) => cell.label);
  }

  function requestAgentConfirm(action: "unmanage" | "delete", row: AgentListRow): void {
    setPendingConfirm({
      action,
      agentRef: row.agentRef,
      agentName: row.name,
      harnessLabels: enabledHarnessLabels(row),
    });
  }

  async function handleConfirmAction(): Promise<void> {
    if (!pendingConfirm) {
      return;
    }
    try {
      if (pendingConfirm.action === "unmanage") {
        await onRemoveAgent(pendingConfirm.agentRef);
      } else {
        await onDeleteAgent(pendingConfirm.agentRef);
      }
      setPendingConfirm(null);
    } catch {
      // The workspace controller already routes list-surface failures into the
      // shared action error banner; keep the dialog open so the user can retry.
    }
  }

  return (
    <>
      <div className="page-chrome">
        <PageHeader
          title={copy.inUse.title}
          actions={
            <ViewModeToggle
              mode={viewMode}
              options={viewModeOptions}
              ariaLabel={copy.inUse.viewModeAria}
              onChange={setViewMode}
            />
          }
        />

        <FilterBar
          searchValue={filters.search}
          onSearchChange={(search) => updateFilters({ search })}
          searchPlaceholder={copy.inUse.searchPlaceholder}
          searchLabel={copy.inUse.searchLabel}
          trailing={
            viewMode === "grid" ? (
              <SelectionMenu
                value={pill}
                options={pillOptions}
                active={pill !== "all"}
                ariaLabel={copy.inUse.filterAria(pillLabel(copy, pill))}
                onChange={setPill}
              />
            ) : undefined
          }
        />
      </div>

      {isInitialLoading ? (
        <div className="panel-state">
          <LoadingSpinner size="md" label={copy.inUse.loading} />
        </div>
      ) : status === "error" ? (
        <div className="panel-state">{copy.inUse.unableToLoad}</div>
      ) : isReady && data ? (
        <>
          {rows.length > 0 ? (
            viewMode === "board" ? (
              <BoardView
                rows={rows}
                checkedRefs={multiSelectedRefs}
                pendingToggleKeys={pendingToggleKeys}
                onOpenAgent={onOpenAgent}
                onToggleChecked={onToggleMultiSelect}
                onClearMultiSelect={onClearMultiSelect}
                onSetAgentAllHarnesses={onSetAgentAllHarnesses}
                onSetManyAgentsAllHarnesses={onSetManyAgentsAllHarnesses}
              />
            ) : viewMode === "matrix" ? (
              <MatrixView
                rows={rows}
                harnessColumns={data.harnessColumns}
                checkedRefs={multiSelectedRefs}
                selectedAgentRef={selectedAgentRef}
                pendingToggleKeys={pendingToggleKeys}
                onOpenAgent={onOpenAgent}
                onToggleChecked={onToggleMultiSelect}
                onToggleCell={onToggleCell}
              />
            ) : (
              <AgentsInUseList
                rows={rows}
                pendingToggleKeys={pendingToggleKeys}
                pendingStructuralActions={pendingStructuralActions}
                selectedAgentRef={selectedAgentRef}
                checkedRefs={multiSelectedRefs}
                onOpenAgent={onOpenAgent}
                onToggleChecked={onToggleMultiSelect}
                onSetAllHarnesses={onSetAgentAllHarnesses}
                onRequestRemove={(row) => requestAgentConfirm("unmanage", row)}
                onRequestDelete={(row) => requestAgentConfirm("delete", row)}
              />
            )
          ) : hasInUseInventory || hasActiveFilters ? (
            <AgentsEmptyState copy={copy.filters} onResetFilters={() => {
              resetFilters();
              setPill("all");
            }} />
          ) : (
            <div className="empty-panel">
              <h3 className="empty-panel__title">{copy.inUse.emptyTitle}</h3>
              <p className="empty-panel__body">
                {copy.inUse.emptyBody}
              </p>
              <div className="empty-panel__actions">
                <Link
                  to="/agents/review"
                  className="action-pill action-pill--md action-pill--accent"
                >
                  {common.actions.reviewItems}
                </Link>
              </div>
            </div>
          )}

        </>
      ) : null}

      {pendingConfirm ? (
        <AgentActionConfirmDialog
          open
          action={pendingConfirm.action}
          agentName={pendingConfirm.agentName}
          harnessLabels={pendingConfirm.harnessLabels}
          isPending={pendingConfirmAction === pendingConfirm.action}
          onOpenChange={(open) => {
            if (!open) {
              setPendingConfirm(null);
            }
          }}
          onConfirm={handleConfirmAction}
        />
      ) : null}
    </>
  );
}

function pillLabel(copy: ReturnType<typeof useAgentsCopy>, value: InUsePillValue): string {
  if (value === "all") return copy.inUse.pills.all;
  if (value === "enabled") return copy.inUse.pills.enabled;
  if (value === "all-harnesses") return copy.inUse.pills.allHarnesses;
  return copy.inUse.pills.off;
}
