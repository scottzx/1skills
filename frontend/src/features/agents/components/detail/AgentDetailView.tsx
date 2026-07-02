import { useId } from "react";

import { DetailHeader } from "../../../../components/detail/DetailHeader";
import { ErrorBanner } from "../../../../components/ErrorBanner";
import { useAgentsCopy } from "../../i18n";
import type { StructuralAgentAction } from "../../model/pending";
import type { HarnessCellState } from "../../model/types";
import { useAgentDetailController } from "../../model/use-agent-detail-controller";
import { AgentActionConfirmDialog } from "../dialogs/AgentActionConfirmDialog";
import { AgentDetailContent } from "./AgentDetailContent";
import { AgentDetailSkeleton } from "./AgentDetailSkeleton";
import { AgentDetailShell } from "./AgentDetailShell";

interface AgentDetailViewProps {
  agentRef: string;
  pendingToggleHarnesses: ReadonlySet<string>;
  pendingStructuralAction: StructuralAgentAction | null;
  onClose: () => void;
  onManageAgent: (agentRef: string) => Promise<void>;
  onToggleAgent: (agentRef: string, harness: string, currentState: HarnessCellState) => Promise<void>;
  onUpdateAgent: (agentRef: string) => Promise<void>;
  onRemoveAgent: (agentRef: string) => Promise<void>;
  onDeleteAgent: (agentRef: string) => Promise<void>;
}

export function AgentDetailView({
  agentRef,
  pendingToggleHarnesses,
  pendingStructuralAction,
  onClose,
  onManageAgent,
  onToggleAgent,
  onUpdateAgent,
  onRemoveAgent,
  onDeleteAgent,
}: AgentDetailViewProps) {
  const fallbackHeadingId = useId();
  const copy = useAgentsCopy();
  const {
      detail,
      isInitialLoading,
      queryErrorMessage,
      actionErrorMessage,
      isRemoveDialogOpen,
      isDeleteDialogOpen,
      dismissActionError,
    onManage,
    onToggleHarness,
    onUpdate,
    requestRemove,
    requestDelete,
    setRemoveDialogOpen,
    setDeleteDialogOpen,
    handleConfirmDelete,
    handleConfirmRemove,
  } = useAgentDetailController(agentRef, {
    onManageAgent,
    onToggleAgent,
    onUpdateAgent,
    onRemoveAgent,
    onDeleteAgent,
  });

  if (isInitialLoading) {
    return <AgentDetailSkeleton onClose={onClose} />;
  }

  if (!detail && queryErrorMessage) {
    return (
      <AgentDetailShell
        chrome={(
          <div className="skill-detail__chrome">
            <DetailHeader
              title={<h2 id={fallbackHeadingId}>{copy.detail.unableToLoad}</h2>}
              closeLabel={copy.detail.close}
              onClose={onClose}
            />
            <ErrorBanner message={queryErrorMessage} />
          </div>
        )}
        body={(
          <div className="skill-detail__fallback">
            <p className="muted-text">{copy.detail.tryAgain}</p>
          </div>
        )}
        bodyAriaLabelledBy={fallbackHeadingId}
      />
    );
  }

  if (!detail) {
    return <AgentDetailSkeleton onClose={onClose} />;
  }

  return (
    <>
      <AgentDetailContent
        detail={detail}
        actionErrorMessage={actionErrorMessage}
        queryErrorMessage={queryErrorMessage}
        pendingToggleHarnesses={pendingToggleHarnesses}
        pendingStructuralAction={pendingStructuralAction}
        onClose={onClose}
        onDismissActionError={dismissActionError}
        onManage={onManage}
        onToggleHarness={(cell) => onToggleHarness(cell.harness, cell.state)}
        onUpdate={onUpdate}
        onRequestRemove={requestRemove}
        onRequestDelete={requestDelete}
      />
      {detail.actions.stopManagingStatus !== null ? (
        <AgentActionConfirmDialog
          open={isRemoveDialogOpen}
          action="unmanage"
          agentName={detail.name}
          harnessLabels={detail.actions.stopManagingHarnessLabels}
          isPending={pendingStructuralAction === "unmanage"}
          onOpenChange={setRemoveDialogOpen}
          onConfirm={handleConfirmRemove}
        />
      ) : null}
      {detail.actions.canDelete ? (
        <AgentActionConfirmDialog
          open={isDeleteDialogOpen}
          action="delete"
          agentName={detail.name}
          harnessLabels={detail.actions.deleteHarnessLabels}
          isPending={pendingStructuralAction === "delete"}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleConfirmDelete}
        />
      ) : null}
    </>
  );
}
