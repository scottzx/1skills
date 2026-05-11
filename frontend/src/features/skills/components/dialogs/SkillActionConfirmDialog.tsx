import { useTranslation } from "react-i18next";
import { ConfirmActionDialog } from "../../../../components/ConfirmActionDialog";

type SkillActionConfirmKind = "unmanage" | "delete";

interface SkillActionConfirmDialogProps {
  open: boolean;
  action: SkillActionConfirmKind;
  skillName: string;
  harnessLabels: readonly string[];
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function SkillActionConfirmDialog({
  open,
  action,
  skillName,
  harnessLabels,
  isPending,
  onOpenChange,
  onConfirm,
}: SkillActionConfirmDialogProps) {
  const { t } = useTranslation("skills");
  const content = action === "unmanage"
    ? {
        title: t("confirmDialog.removeTitle"),
        description: (
          <>
            {t("confirmDialog.removeDescription", { skillName })}
          </>
        ),
        note:
          harnessLabels.length > 0 ? (
            <p>{t("confirmDialog.willRestoreTo")}: {harnessLabels.join(", ")}</p>
          ) : undefined,
        confirmLabel: t("confirmDialog.removeButton"),
        pendingLabel: t("confirmDialog.removing"),
        confirmTone: "primary" as const,
      }
    : {
        title: t("confirmDialog.deleteTitle"),
        description: (
          <>
            {t("confirmDialog.deleteDescriptionWithName", { skillName })}
          </>
        ),
        note: (
          <>
            <p>{t("confirmDialog.deleteDescription")}</p>
            {harnessLabels.length > 0 ? (
              <p>{t("confirmDialog.affectedHarnesses")}: {harnessLabels.join(", ")}</p>
            ) : null}
          </>
        ),
        confirmLabel: t("confirmDialog.deleteButton"),
        pendingLabel: t("confirmDialog.deleting"),
        confirmTone: "danger" as const,
      };

  return (
    <ConfirmActionDialog
      open={open}
      title={content.title}
      description={content.description}
      note={content.note}
      confirmLabel={content.confirmLabel}
      pendingLabel={content.pendingLabel}
      isPending={isPending}
      confirmTone={content.confirmTone}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />
  );
}
