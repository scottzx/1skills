import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "../../../../components/LoadingSpinner";
import type { SkillUpdateStatus } from "../../model/types";

interface SkillDetailUpdateControlProps {
  updateStatus: SkillUpdateStatus;
  pending: boolean;
  disabled: boolean;
  onUpdate: () => void;
}

export function SkillDetailUpdateControl({
  updateStatus,
  pending,
  disabled,
  onUpdate,
}: SkillDetailUpdateControlProps) {
  const { t } = useTranslation("skills");
  if (updateStatus === "update_available") {
    return (
      <button
        type="button"
        className="action-pill action-pill--md skill-detail__update-control"
        disabled={disabled}
        onClick={onUpdate}
      >
        {pending ? <LoadingSpinner size="sm" label={t("detail.updatingSkill")} /> : null}
        {t("detail.updateFromSource")}
      </button>
    );
  }

  if (updateStatus === "local_changes_detected") {
    return null;
  }

  const labelMap: Record<Exclude<SkillUpdateStatus, "update_available" | "local_changes_detected">, string> = {
    no_update_available: t("detail.noUpdateAvailable"),
    no_source_available: t("detail.noSourceAvailable"),
  };

  return (
    <span className="card-status-pill card-status-pill--md skill-detail__update-control">
      {labelMap[updateStatus]}
    </span>
  );
}
