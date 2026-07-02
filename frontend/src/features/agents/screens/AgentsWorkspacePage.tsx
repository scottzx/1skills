import { Outlet } from "react-router-dom";

import { BulkActionBar } from "../../../components/BulkActionBar";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { AgentDetailModal } from "../components/detail/AgentDetailModal";
import { useAgentsCopy } from "../i18n";
import { pendingToggleHarnessesForAgent } from "../model/pending";
import { useAgentsWorkspaceController } from "../model/use-agents-workspace-controller";

export default function AgentsWorkspacePage() {
  const {
    context,
    activeTab,
    selectedAgentRef,
    isDesktopDetailOpen,
    actionErrorMessage,
    queryErrorMessage,
    closeSelectedAgent,
    handleManageAgent,
    handleToggleAgent,
    handleUpdateAgent,
    handleRemoveAgent,
    handleDeleteAgent,
    dismissActionError,
  } = useAgentsWorkspaceController();
  const copy = useAgentsCopy();

  const hasData = context.hasData;
  const selectedPendingToggleHarnesses = selectedAgentRef
    ? pendingToggleHarnessesForAgent(context.pendingToggleKeys, selectedAgentRef)
    : EMPTY_PENDING_TOGGLE_HARNESSES;
  const selectedPendingStructuralAction = selectedAgentRef
    ? context.pendingStructuralActions.get(selectedAgentRef) ?? null
    : null;

  return (
    <>
      {actionErrorMessage ? (
        <ErrorBanner message={actionErrorMessage} onDismiss={dismissActionError} />
      ) : null}
      {!actionErrorMessage && hasData && queryErrorMessage ? (
        <ErrorBanner message={queryErrorMessage} />
      ) : null}
      <Outlet context={context} />

      {activeTab === "inUse" ? (
        <BulkActionBar
          selectedCount={context.multiSelectedRefs.size}
          pending={context.multiSelectPending}
          onClear={context.onClearMultiSelect}
          onEnableAll={context.onMultiSelectEnableAll}
          onDisableAll={context.onMultiSelectDisableAll}
          onDelete={context.onMultiSelectDelete}
          destructive={{
            actionLabel: copy.bulk.delete,
            confirmTitle: copy.bulk.confirmTitle(context.multiSelectedRefs.size),
            confirmDescription: copy.bulk.confirmDescription,
            confirmNote: copy.bulk.confirmNote,
          }}
        />
      ) : null}

      <AgentDetailModal
        open={isDesktopDetailOpen || Boolean(selectedAgentRef)}
        agentRef={selectedAgentRef}
        pendingToggleHarnesses={selectedPendingToggleHarnesses}
        pendingStructuralAction={selectedPendingStructuralAction}
        onClose={closeSelectedAgent}
        onManageAgent={handleManageAgent}
        onToggleAgent={handleToggleAgent}
        onUpdateAgent={handleUpdateAgent}
        onRemoveAgent={handleRemoveAgent}
        onDeleteAgent={handleDeleteAgent}
      />
    </>
  );
}

const EMPTY_PENDING_TOGGLE_HARNESSES = new Set<string>();
