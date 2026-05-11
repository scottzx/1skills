import { useTranslation } from "react-i18next";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { FilterBar } from "../../../components/FilterBar";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { PageHeader } from "../../../components/PageHeader";
import { NeedsReviewRow } from "../../../components/cards/NeedsReviewRow";
import { UiTooltip } from "../../../components/ui/UiTooltip";
import { getHarnessPresentation } from "../../../components/harness/harnessPresentation";
import { SlashCommandReviewDetailSheet } from "../components/detail/SlashCommandReviewDetailSheet";
import {
  reviewActionTitle,
  primaryReviewAction,
  reviewActionLabel,
  reviewMetaText,
} from "../model/selectors";
import {
  reviewKey,
  useSlashCommandsReviewController,
} from "../model/useSlashCommandsReviewController";
import type { SlashCommandReviewDto, SlashReviewAction } from "../api/types";
const REVIEW_ACTION_LABEL_MAP: Record<SlashReviewAction, string> = {
  import: "actions.adopt",
  restore_managed: "actions.restore",
  adopt_target: "actions.adopt",
  remove_binding: "actions.removeBinding",
};

const REVIEW_ACTION_TITLE_MAP: Record<SlashReviewAction, string> = {
  import: "tooltips.adoptReview",
  restore_managed: "tooltips.restore",
  adopt_target: "tooltips.adopt",
  remove_binding: "tooltips.removeBinding",
};

const REVIEW_KIND_META_MAP: Record<string, string> = {
  drifted: "tooltips.changedIn",
  missing: "tooltips.missingFrom",
  unmanaged: "tooltips.foundIn",
};

export default function SlashCommandsReviewPage() {
  const { t } = useTranslation("slashCommands");
  const controller = useSlashCommandsReviewController();
  const {
    actionError,
    eligibleImportRows,
    importAllPending,
    pendingKey,
    query,
    rows,
    search,
    selectedCanonicalCommand,
    selectedRow,
    closeReviewDetail,
    openReviewDetail,
    setActionError,
    setSearch,
    handleAction,
    handleImportAll,
  } = controller;

  const total = query.data?.reviewCommands.length ?? 0;

  return (
    <>
      <div className="page-chrome">
        <PageHeader
          title={t("review.title")}
          subtitle={
            total > 0
              ? t("review.subtitle", { count: total })
              : t("review.subtitleEmpty")
          }
          actions={
            <button
              type="button"
              className="action-pill action-pill--md action-pill--accent"
              disabled={eligibleImportRows.length === 0 || importAllPending}
              onClick={() => {
                void handleImportAll();
              }}
            >
              {importAllPending ? <LoadingSpinner size="sm" label={t("review.adoptingAll")} /> : null}
              {t("review.adoptAll")}
            </button>
          }
        />
        {total > 0 ? (
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("review.searchLabel")}
            searchLabel={t("review.searchLabel")}
          />
        ) : null}
      </div>

      {actionError ? <ErrorBanner message={actionError} onDismiss={() => setActionError("")} /> : null}
      {query.error ? (
        <ErrorBanner message={query.error instanceof Error ? query.error.message : t("errorTitle")} />
      ) : null}

      {query.isPending ? (
        <div className="panel-state">
          <LoadingSpinner label={t("loading")} />
        </div>
      ) : rows.length > 0 ? (
        <section className="needs-review-rows" aria-label="Slash commands to review list">
          {rows.map((row) => (
            <SlashCommandReviewRow
              key={row.reviewRef}
              row={row}
              pendingKey={pendingKey}
              onAction={handleAction}
              onOpen={openReviewDetail}
            />
          ))}
        </section>
      ) : (
        <div className="empty-panel">
          <h3 className="empty-panel__title">{t("review.emptyTitle")}</h3>
          <p className="empty-panel__body">
            {t("review.emptyDescription")}
          </p>
        </div>
      )}

      <SlashCommandReviewDetailSheet
        row={selectedRow}
        canonicalCommand={selectedCanonicalCommand}
        targets={query.data?.targets ?? []}
        pendingKey={pendingKey}
        actionError={actionError}
        onClose={closeReviewDetail}
        onAction={handleAction}
      />
    </>
  );
}

function SlashCommandReviewRow({
  row,
  pendingKey,
  onAction,
  onOpen,
}: {
  row: SlashCommandReviewDto;
  pendingKey: string | null;
  onAction: (row: SlashCommandReviewDto, action?: SlashReviewAction | null) => Promise<boolean>;
  onOpen: (row: SlashCommandReviewDto) => void;
}) {
  const { t } = useTranslation("slashCommands");
  const primaryAction = primaryReviewAction(row);
  const secondaryActions = row.actions.filter((action) => action !== primaryAction);
  const presentation = getHarnessPresentation(row.target === "claude" ? "claude" : row.target);
  const logo = (
    <UiTooltip content={row.targetLabel}>
      <span className="harness-stack__item">
        {presentation ? (
          <img src={presentation.logoSrc} alt="" aria-hidden="true" />
        ) : (
          <span className="harness-stack__fallback">{row.targetLabel.slice(0, 1)}</span>
        )}
      </span>
    </UiTooltip>
  );

  const metaKindKey = REVIEW_KIND_META_MAP[row.kind] ?? "tooltips.foundIn";
  const metaText = row.kind
    ? `${t(metaKindKey)} ${row.targetLabel}`
    : row.targetLabel;

  return (
    <NeedsReviewRow
      name={row.name}
      logos={<span className="harness-stack">{logo}</span>}
      metaText={metaText}
      statusChip={
        secondaryActions.length > 0 ? (
          <span className="slash-review-actions">
            {secondaryActions.map((action) => (
              <button
                key={action}
                type="button"
                className="action-pill"
                title={t(REVIEW_ACTION_TITLE_MAP[action] ?? "tooltips.adoptReview")}
                disabled={pendingKey === reviewKey(row.target, row.name, action)}
                onClick={(event) => {
                  event.stopPropagation();
                  void onAction(row, action);
                }}
              >
                {t(REVIEW_ACTION_LABEL_MAP[action] ?? "actions.adopt")}
              </button>
            ))}
          </span>
        ) : undefined
      }
      description={row.description || row.path}
      actionLabel={primaryAction ? t(REVIEW_ACTION_LABEL_MAP[primaryAction] ?? "actions.adopt") : t("actions.review")}
      actionTitle={primaryAction ? t(REVIEW_ACTION_TITLE_MAP[primaryAction] ?? "tooltips.adoptReview") : row.error ?? t("review.cannotUpdate")}
      pending={primaryAction ? pendingKey === reviewKey(row.target, row.name, primaryAction) : false}
      actionDisabled={!primaryAction}
      onOpen={() => onOpen(row)}
      onAction={() => void onAction(row, primaryAction)}
    />
  );
}
