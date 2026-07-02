import { lazy, Suspense, useId } from "react";

import { DetailDisclosure } from "../../../../components/detail/DetailDisclosure";
import { DetailHeader } from "../../../../components/detail/DetailHeader";
import { DetailNote } from "../../../../components/detail/DetailNote";
import { DetailSection } from "../../../../components/detail/DetailSection";
import { ErrorBanner } from "../../../../components/ErrorBanner";
import { LoadingSpinner } from "../../../../components/LoadingSpinner";
import { skillStatusConcept } from "../../../../lib/product-language";
import { useAgentsCopy, type AgentsCopy } from "../../i18n";
import type { StructuralAgentAction } from "../../model/pending";
import type { HarnessCell, AgentDetail } from "../../model/types";
import { AgentDetailHarnessMatrix } from "./AgentDetailHarnessMatrix";
import { AgentDetailRemoveAction } from "./AgentDetailRemoveAction";
import { AgentDetailUpdateControl } from "./AgentDetailUpdateControl";
import { AgentDetailShell } from "./AgentDetailShell";

const MarkdownDocument = lazy(() => import("../../../../components/MarkdownDocument"));

interface AgentDetailContentProps {
  detail: AgentDetail;
  actionErrorMessage: string;
  queryErrorMessage: string;
  pendingToggleHarnesses: ReadonlySet<string>;
  pendingStructuralAction: StructuralAgentAction | null;
  onClose: () => void;
  onDismissActionError: () => void;
  onManage: () => void;
  onToggleHarness: (cell: HarnessCell) => void;
  onUpdate: () => void;
  onRequestRemove: () => void;
  onRequestDelete: () => void;
}

export function AgentDetailContent({
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
}: AgentDetailContentProps) {
  const headingId = useId();
  const copy = useAgentsCopy();
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
    <AgentDetailShell
      chrome={(
        <div className="skill-detail__chrome">
          <DetailHeader
            title={<h2 id={headingId}>{detail.name}</h2>}
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
          title="Agent"
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
            <AgentDetailHarnessMatrix
              agentName={detail.name}
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
                <LoadingSpinner size="sm" label={copy.detail.managingAgent} />
              ) : null}
              {copy.detail.addToSkillManager}
            </button>
          ) : null}
          {showUpdateControl ? (
            <AgentDetailUpdateControl
              updateStatus={detail.actions.updateStatus!}
              pending={pendingStructuralAction === "update"}
              disabled={controlsDisabled}
              onUpdate={onUpdate}
            />
          ) : null}
          {detail.actions.stopManagingStatus !== null ? (
            <AgentDetailRemoveAction
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
                <LoadingSpinner size="sm" label={copy.confirm.deletingAgent} />
              ) : null}
              {copy.detail.deleteAgent}
            </button>
          ) : null}
        </>
      ) : undefined}
      bodyAriaLabelledBy={headingId}
    />
  );
}

function computeShowFooter(detail: AgentDetail): boolean {
  return (
    detail.actions.canManage ||
    (detail.actions.updateStatus !== null && detail.actions.updateStatus !== "local_changes_detected") ||
    detail.actions.stopManagingStatus !== null ||
    detail.actions.canDelete
  );
}

function locationDescriptor(
  detail: AgentDetail,
  location: AgentDetail["locations"][number],
  copy: AgentsCopy,
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
