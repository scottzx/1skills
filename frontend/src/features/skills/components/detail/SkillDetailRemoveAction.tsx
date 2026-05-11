import { useTranslation } from "react-i18next";
import { UiTooltip } from "../../../../components/ui/UiTooltip";
import { UiTooltipTriggerBoundary } from "../../../../components/ui/UiTooltipTriggerBoundary";
import type { SkillRemoveStatus } from "../../model/types";

interface SkillDetailRemoveActionProps {
  status: SkillRemoveStatus;
  disabled: boolean;
  onRequestRemove: () => void;
}

export function SkillDetailRemoveAction({
  status,
  disabled,
  onRequestRemove,
}: SkillDetailRemoveActionProps) {
  const { t } = useTranslation("skills");
  const isBlocked = disabled || status === "disabled_no_enabled";

  const copy = status === "disabled_no_enabled"
    ? t("detail.removeBlockedHint")
    : t("detail.removeDescription");

  const button = (
    <button
      type="button"
      className="action-pill action-pill--md"
      disabled={isBlocked}
      onClick={status === "available" ? () => {
        onRequestRemove();
      } : undefined}
    >
      {t("detail.removeFromManager")}
    </button>
  );

  if (isBlocked) {
    return (
      <UiTooltipTriggerBoundary
        content={copy}
        contentClassName="ui-popup--tooltip--hint"
        align="end"
      >
        {button}
      </UiTooltipTriggerBoundary>
    );
  }

  return (
    <UiTooltip content={copy} contentClassName="ui-popup--tooltip--hint" align="end">
      {button}
    </UiTooltip>
  );
}
