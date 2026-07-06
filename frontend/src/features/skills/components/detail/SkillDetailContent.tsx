import { lazy, Suspense, useId, useState } from "react";

import { DetailDisclosure } from "../../../../components/detail/DetailDisclosure";
import { DetailHeader } from "../../../../components/detail/DetailHeader";
import { DetailNote } from "../../../../components/detail/DetailNote";
import { DetailSection } from "../../../../components/detail/DetailSection";
import { DetailSourceLinks, type DetailSourceLink } from "../../../../components/detail/DetailSourceLinks";
import { ErrorBanner } from "../../../../components/ErrorBanner";
import { LoadingSpinner } from "../../../../components/LoadingSpinner";
import { skillStatusConcept } from "../../../../lib/product-language";
import { useSkillsCopy, type SkillsCopy } from "../../i18n";
import { usePromoteSkillMutation, useSkillVersionsQuery } from "../../api/queries";
import type { StructuralSkillAction } from "../../model/pending";
import type { HarnessCell, SkillDetail, SkillSourceLinks } from "../../model/types";
import { SkillDetailHarnessMatrix } from "./SkillDetailHarnessMatrix";
import { SkillDetailRemoveAction } from "./SkillDetailRemoveAction";
import { SkillDetailUpdateControl } from "./SkillDetailUpdateControl";
import { SkillDetailShell } from "./SkillDetailShell";
import { SkillVersionHistoryModal } from "./SkillVersionHistoryModal";

const MarkdownDocument = lazy(() => import("../../../../components/MarkdownDocument"));

interface SkillDetailContentProps {
  detail: SkillDetail;
  actionErrorMessage: string;
  queryErrorMessage: string;
  pendingToggleHarnesses: ReadonlySet<string>;
  pendingStructuralAction: StructuralSkillAction | null;
  onClose: () => void;
  onDismissActionError: () => void;
  onManage: () => void;
  onToggleHarness: (cell: HarnessCell) => void;
  onUpdate: () => void;
  onRequestRemove: () => void;
  onRequestDelete: () => void;
}

export function SkillDetailContent({
  detail,
  actionErrorMessage,
  queryErrorMessage,
  pendingToggleHarnesses,
  pendingStructuralAction,
  onClose,
  onDismissActionError,
  onManage,
  onToggleHarness,
  onUpdate,
  onRequestRemove,
  onRequestDelete,
}: SkillDetailContentProps) {
  const headingId = useId();
  const copy = useSkillsCopy();
  const [historyOpen, setHistoryOpen] = useState(false);
  const versionsQuery = useSkillVersionsQuery(detail.lineage?.id ?? null);
  const promoteMutation = usePromoteSkillMutation();
  const versionCount = versionsQuery.data?.versions.length ?? 0;
  const lineage = detail.lineage;
  const showSkillManagerStoreNote =
    skillStatusConcept(detail.displayStatus) === "inUse" &&
    detail.locations.some((location) => location.kind === "shared");
  const hasPendingHarnessToggles = pendingToggleHarnesses.size > 0;
  const structuralLocked = pendingStructuralAction !== null;
  const controlsDisabled = structuralLocked || hasPendingHarnessToggles;

  const errorMessage = actionErrorMessage || queryErrorMessage;
  const dismissError = actionErrorMessage ? onDismissActionError : undefined;

  const showUpdateControl = detail.actions.updateStatus !== null && detail.actions.updateStatus !== "local_changes_detected";
  const showFooter = computeShowFooter(detail);
  const showHarnessSection = detail.harnessCells.length > 0;

  return (
    <>
    <SkillDetailShell
      chrome={(
        <div className="skill-detail__chrome">
          <DetailHeader
            title={<h2 id={headingId}>{detail.name}</h2>}
            meta={(
              <div className="detail-sheet__meta">
                {detail.primaryTag || detail.secondaryTag ? (
                  <div className="skill-detail__tags" style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
                    {detail.primaryTag ? (
                      <span className="tag-badge primary" style={{ background: "rgba(0, 200, 255, 0.15)", color: "#00c8ff", fontSize: "11px", padding: "3px 8px", borderRadius: "3px", fontWeight: "bold" }}>
                        {detail.primaryTag}
                      </span>
                    ) : null}
                    {detail.secondaryTag ? (
                      <span className="tag-badge secondary" style={{ background: "rgba(255, 200, 0, 0.15)", color: "#ffc800", fontSize: "11px", padding: "3px 8px", borderRadius: "3px", fontWeight: "bold" }}>
                        {detail.secondaryTag}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {lineage ? (
                  <div className="skill-detail__version-row">
                    <span className="card-status-pill">{copy.versioning.versionBadge(lineage.version)}</span>
                    {lineage.forkedFrom ? (
                      <span className="card-status-pill card-status-pill--accent">
                        {copy.versioning.forkBadge(lineage.forkedFromVersion ?? 1)}
                      </span>
                    ) : null}
                    {!lineage.isPrimary ? (
                      <button
                        type="button"
                        className="action-pill"
                        disabled={promoteMutation.isPending}
                        onClick={() => lineage.id && promoteMutation.mutate({ id: lineage.id })}
                      >
                        {promoteMutation.isPending ? (
                          <LoadingSpinner size="sm" label={copy.versioning.makingMain} />
                        ) : null}
                        {promoteMutation.isPending ? copy.versioning.makingMain : copy.versioning.makeMain}
                      </button>
                    ) : null}
                    {lineage.isPrimary && lineage.forkedFrom ? (
                      <span className="card-status-pill card-status-pill--success">{copy.versioning.mainBadge}</span>
                    ) : null}
                    <button
                      type="button"
                      className="action-pill"
                      onClick={() => setHistoryOpen(true)}
                    >
                      {copy.versioning.historyButton(versionCount)}
                    </button>
                  </div>
                ) : null}
                {detail.sourceLinks ? (
                  <DetailSourceLinks
                    ariaLabel={copy.detail.sourceLinksAria(detail.sourceLinks.repoLabel)}
                    links={skillSourceLinks(detail.sourceLinks, copy)}
                  />
                ) : null}
              </div>
            )}
            closeLabel={copy.detail.close}
            onClose={onClose}
          />
          {errorMessage ? (
            <ErrorBanner message={errorMessage} onDismiss={dismissError} />
          ) : null}
        </div>
      )}
      body={(
        <>
        <DetailSection heading={copy.detail.about}>
          <p className="skill-detail__copy">
            {detail.description || copy.detail.noDescription}
          </p>
          {detail.attentionMessage ? (
            <DetailNote>{detail.attentionMessage}</DetailNote>
          ) : null}
        </DetailSection>

        <DetailDisclosure
          title="SKILL.md"
          defaultOpen={false}
          className="skill-detail__disclosure skill-detail__disclosure--document"
        >
          <div className="skill-detail__document-surface">
            {detail.documentMarkdown ? (
              <Suspense fallback={<LoadingSpinner size="sm" label={copy.detail.loadingDocument} />}>
                <MarkdownDocument markdown={detail.documentMarkdown} />
              </Suspense>
            ) : (
              <p className="skill-detail__copy">
                {copy.detail.noDocument}
              </p>
            )}
          </div>
        </DetailDisclosure>

        {showHarnessSection ? (
          <DetailSection heading={copy.detail.harnesses}>
            <SkillDetailHarnessMatrix
              skillName={detail.name}
              cells={detail.harnessCells}
              pendingToggleHarnesses={pendingToggleHarnesses}
              pendingStructuralAction={pendingStructuralAction}
              onToggleCell={onToggleHarness}
            />
          </DetailSection>
        ) : null}

        {detail.locations.length > 0 ? (
          <DetailSection heading={copy.detail.locations}>
            {showSkillManagerStoreNote ? (
              <p className="skill-detail__context-note">
                {copy.detail.storeNote}
              </p>
            ) : null}
            <div className="skill-detail__locations">
              {detail.locations.map((location, index) => {
                const descriptor = locationDescriptor(detail, location, copy);
                return (
                  <article
                    key={`${location.kind}:${location.path ?? index}`}
                    className="skill-detail__location"
                  >
                    <div className="skill-detail__location-header">
                      <strong>{location.label}</strong>
                      {descriptor ? (
                        <span className="skill-detail__location-note">{descriptor}</span>
                      ) : null}
                    </div>
                    <p className="skill-detail__location-path">
                      {location.path ?? location.detail ?? location.sourceLocator}
                    </p>
                  </article>
                );
              })}
            </div>
          </DetailSection>
        ) : null}
        </>
      )}
      footer={showFooter ? (
        <>
          {detail.actions.canManage ? (
            <button
              type="button"
              className="action-pill action-pill--md action-pill--accent"
              disabled={controlsDisabled}
              onClick={onManage}
            >
              {pendingStructuralAction === "manage" ? (
                <LoadingSpinner size="sm" label={copy.detail.managingSkill} />
              ) : null}
              {copy.detail.addToSkillManager}
            </button>
          ) : null}
          {showUpdateControl ? (
            <SkillDetailUpdateControl
              updateStatus={detail.actions.updateStatus!}
              pending={pendingStructuralAction === "update"}
              disabled={controlsDisabled}
              onUpdate={onUpdate}
            />
          ) : null}
          {detail.actions.stopManagingStatus !== null ? (
            <SkillDetailRemoveAction
              status={detail.actions.stopManagingStatus}
              disabled={controlsDisabled}
              onRequestRemove={onRequestRemove}
            />
          ) : null}
          {detail.actions.canDelete ? (
            <button
              type="button"
              className="action-pill action-pill--md action-pill--danger"
              disabled={controlsDisabled}
              onClick={onRequestDelete}
            >
              {pendingStructuralAction === "delete" ? (
                <LoadingSpinner size="sm" label={copy.confirm.deletingSkill} />
              ) : null}
              {copy.detail.deleteSkill}
            </button>
          ) : null}
        </>
      ) : undefined}
      bodyAriaLabelledBy={headingId}
    />
    <SkillVersionHistoryModal
      open={historyOpen}
      skillId={detail.lineage?.id ?? null}
      onClose={() => setHistoryOpen(false)}
    />
    </>
  );
}

function skillSourceLinks(sourceLinks: SkillSourceLinks, copy: SkillsCopy): DetailSourceLink[] {
  const links: DetailSourceLink[] = [
    {
      href: sourceLinks.repoUrl,
      label: sourceLinks.repoLabel,
      kind: "repo",
    },
  ];
  if (sourceLinks.folderUrl) {
    links.push({
      href: sourceLinks.folderUrl,
      label: copy.detail.openSkillFolder,
      kind: "folder",
    });
  }
  return links;
}

function computeShowFooter(detail: SkillDetail): boolean {
  return (
    detail.actions.canManage ||
    (detail.actions.updateStatus !== null && detail.actions.updateStatus !== "local_changes_detected") ||
    detail.actions.stopManagingStatus !== null ||
    detail.actions.canDelete
  );
}

function locationDescriptor(
  detail: SkillDetail,
  location: SkillDetail["locations"][number],
  copy: SkillsCopy,
): string | null {
  if (skillStatusConcept(detail.displayStatus) !== "inUse") {
    return null;
  }
  if (location.kind === "shared") {
    return copy.detail.canonicalPhysicalPackage;
  }
  if (location.kind === "harness") {
    return copy.detail.symlinkToStore;
  }
  return null;
}
