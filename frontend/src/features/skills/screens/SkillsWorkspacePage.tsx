import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BulkActionBar } from "../../../components/BulkActionBar";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { SkillDetailModal } from "../components/detail/SkillDetailModal";
import { pendingToggleHarnessesForSkill } from "../model/pending";
import { useSkillsWorkspaceController } from "../model/use-skills-workspace-controller";

export default function SkillsWorkspacePage() {
  const { t } = useTranslation("skills");
  const {
    context,
    activeTab,
    selectedSkillRef,
    isDesktopDetailOpen,
    actionErrorMessage,
    queryErrorMessage,
    closeSelectedSkill,
    handleManageSkill,
    handleToggleSkill,
    handleUpdateSkill,
    handleRemoveSkill,
    handleDeleteSkill,
    dismissActionError,
  } = useSkillsWorkspaceController();

  const hasData = context.hasData;
  const selectedPendingToggleHarnesses = selectedSkillRef
    ? pendingToggleHarnessesForSkill(context.pendingToggleKeys, selectedSkillRef)
    : EMPTY_PENDING_TOGGLE_HARNESSES;
  const selectedPendingStructuralAction = selectedSkillRef
    ? context.pendingStructuralActions.get(selectedSkillRef) ?? null
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
            actionLabel: t("workspace.deleteButton"),
            confirmTitle: t("workspace.deleteTitle", { count: context.multiSelectedRefs.size }),
            confirmDescription:
              t("workspace.deleteHarnessDescription"),
            confirmNote: t("workspace.deleteHarnessNote"),
          }}
        />
      ) : null}

      <SkillDetailModal
        open={isDesktopDetailOpen || Boolean(selectedSkillRef)}
        skillRef={selectedSkillRef}
        pendingToggleHarnesses={selectedPendingToggleHarnesses}
        pendingStructuralAction={selectedPendingStructuralAction}
        onClose={closeSelectedSkill}
        onManageSkill={handleManageSkill}
        onToggleSkill={handleToggleSkill}
        onUpdateSkill={handleUpdateSkill}
        onRemoveSkill={handleRemoveSkill}
        onDeleteSkill={handleDeleteSkill}
      />
    </>
  );
}

const EMPTY_PENDING_TOGGLE_HARNESSES = new Set<string>();
