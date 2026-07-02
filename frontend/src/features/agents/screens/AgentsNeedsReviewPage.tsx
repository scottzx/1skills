import { useMemo } from "react";

import { FilterBar } from "../../../components/FilterBar";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { PageHeader } from "../../../components/PageHeader";
import { AgentsNeedsReviewList } from "../components/cards/AgentsNeedsReviewList";
import { AgentsEmptyState } from "../components/pane/AgentsEmptyState";
import { useAgentsCopy } from "../i18n";
import { useAgentsWorkspace } from "../model/workspace-context";
import {
  countAdoptableLocalAgentRows,
  countNeedsReviewRows,
  filterNeedsReviewRows,
} from "../model/selectors";
import { useAgentsNeedsReviewSession } from "../model/session";

export default function AgentsNeedsReviewPage() {
  const {
    data,
    status,
    pendingStructuralActions,
    pendingBulkAction,
    selectedAgentRef,
    onManageAll,
    onManageAgent,
    onOpenAgent,
    isInitialLoading,
  } = useAgentsWorkspace();
  const { filters, updateFilters, resetFilters } = useAgentsNeedsReviewSession();
  const copy = useAgentsCopy();

  const rows = useMemo(() => filterNeedsReviewRows(data, filters), [data, filters]);
  const needsReviewCount = useMemo(() => countNeedsReviewRows(data), [data]);
  const adoptableCount = useMemo(() => countAdoptableLocalAgentRows(data), [data]);
  const isReady = status === "ready" && Boolean(data);

  return (
    <>
      <div className="page-chrome">
        <PageHeader
          title={copy.review.title}
          subtitle={copy.review.subtitle(needsReviewCount)}
          actions={
            <button
              type="button"
              className="action-pill action-pill--md action-pill--accent"
              disabled={pendingBulkAction !== null || adoptableCount === 0}
              onClick={onManageAll}
            >
              {pendingBulkAction === "manage-all" ? (
                <LoadingSpinner size="sm" label={copy.review.adoptingAllAgents} />
              ) : null}
              {copy.review.adoptAllEligible}
            </button>
          }
        />

        {needsReviewCount > 0 ? (
          <FilterBar
            searchValue={filters.search}
            onSearchChange={(search) => updateFilters({ search })}
            searchPlaceholder={copy.review.searchPlaceholder}
            searchLabel={copy.review.searchLabel}
          />
        ) : null}
      </div>

      {isInitialLoading ? (
        <div className="panel-state">
          <LoadingSpinner size="md" label={copy.review.loading} />
        </div>
      ) : status === "error" ? (
        <div className="panel-state">{copy.review.unableToLoad}</div>
      ) : isReady && data ? (
        rows.length > 0 ? (
          <AgentsNeedsReviewList
            rows={rows}
            pendingStructuralActions={pendingStructuralActions}
            bulkActionPending={pendingBulkAction !== null}
            selectedAgentRef={selectedAgentRef}
            onOpenAgent={onOpenAgent}
            onManageAgent={onManageAgent}
          />
        ) : needsReviewCount > 0 ? (
          <AgentsEmptyState copy={copy.filters} onResetFilters={resetFilters} />
        ) : (
          <div className="empty-panel">
            <h3 className="empty-panel__title">{copy.review.emptyTitle}</h3>
            <p className="empty-panel__body">
              {copy.review.emptyBody}
            </p>
          </div>
        )
      ) : null}
    </>
  );
}
