import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { FilterBar } from "../../../components/FilterBar";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { PageHeader } from "../../../components/PageHeader";
import { SkillsNeedsReviewList } from "../components/cards/SkillsNeedsReviewList";
import { SkillsEmptyState } from "../components/pane/SkillsEmptyState";
import { useSkillsWorkspace } from "../model/workspace-context";
import {
  countAdoptableLocalSkillRows,
  countNeedsReviewRows,
  filterNeedsReviewRows,
  hasActiveNeedsReviewFilters,
} from "../model/selectors";
import { useSkillsNeedsReviewSession } from "../model/session";

export default function SkillsNeedsReviewPage() {
  const { t } = useTranslation("skills");
  const {
    data,
    status,
    pendingStructuralActions,
    pendingBulkAction,
    selectedSkillRef,
    onManageAll,
    onManageSkill,
    onOpenSkill,
    isInitialLoading,
  } = useSkillsWorkspace();
  const { filters, updateFilters, resetFilters } = useSkillsNeedsReviewSession();

  const rows = useMemo(() => filterNeedsReviewRows(data, filters), [data, filters]);
  const hasActiveFilters = useMemo(() => hasActiveNeedsReviewFilters(filters), [filters]);
  const needsReviewCount = useMemo(() => countNeedsReviewRows(data), [data]);
  const adoptableCount = useMemo(() => countAdoptableLocalSkillRows(data), [data]);
  const isReady = status === "ready" && Boolean(data);

  return (
    <>
      <div className="page-chrome">
        <PageHeader
          title={t("needsReview.title")}
          subtitle={
            needsReviewCount > 0
              ? t("needsReview.subtitle", { count: needsReviewCount })
              : t("needsReview.subtitleEmpty")
          }
          actions={
            <button
              type="button"
              className="action-pill action-pill--md action-pill--accent"
              disabled={pendingBulkAction !== null || adoptableCount === 0}
              onClick={onManageAll}
            >
              {pendingBulkAction === "manage-all" ? (
                <LoadingSpinner size="sm" label={t("needsReview.adoptingAll")} />
              ) : null}
              {t("needsReview.adoptAll")}
            </button>
          }
        />

        {needsReviewCount > 0 ? (
          <FilterBar
            searchValue={filters.search}
            onSearchChange={(search) => updateFilters({ search })}
            searchPlaceholder={t("needsReview.searchPlaceholder")}
            searchLabel={t("needsReview.searchLabel")}
          />
        ) : null}
      </div>

      {isInitialLoading ? (
        <div className="panel-state">
          <LoadingSpinner size="md" label={t("needsReview.loading")} />
        </div>
      ) : status === "error" ? (
        <div className="panel-state">{t("needsReview.errorLoading")}</div>
      ) : isReady && data ? (
        rows.length > 0 ? (
          <SkillsNeedsReviewList
            rows={rows}
            pendingStructuralActions={pendingStructuralActions}
            bulkActionPending={pendingBulkAction !== null}
            selectedSkillRef={selectedSkillRef}
            onOpenSkill={onOpenSkill}
            onManageSkill={onManageSkill}
          />
        ) : needsReviewCount > 0 ? (
          <SkillsEmptyState onResetFilters={resetFilters} />
        ) : (
          <div className="empty-panel">
            <h3 className="empty-panel__title">{t("needsReview.emptyTitle")}</h3>
            <p className="empty-panel__body">
              {t("needsReview.emptyBodyInUse")}
            </p>
            <div className="empty-panel__actions">
              <Link
                to="/marketplace/skills"
                className="action-pill action-pill--md action-pill--accent"
              >
                {t("needsReview.openMarketplace")}
              </Link>
            </div>
          </div>
        )
      ) : null}

      {hasActiveFilters && rows.length === 0 ? null : null}
    </>
  );
}
