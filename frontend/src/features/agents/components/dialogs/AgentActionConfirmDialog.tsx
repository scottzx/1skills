import { ConfirmActionDialog } from "../../../../components/ConfirmActionDialog";
import { useAgentsCopy } from "../../i18n";

type AgentActionConfirmKind = "unmanage" | "delete";

interface AgentActionConfirmDialogProps {
  open: boolean;
  action: AgentActionConfirmKind;
  agentName: string;
  harnessLabels: readonly string[];
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function AgentActionConfirmDialog({
  open,
  action,
  agentName,
  harnessLabels,
  isPending,
  onOpenChange,
  onConfirm,
}: AgentActionConfirmDialogProps) {
  const copy = useAgentsCopy();
  const content = action === "unmanage"
    ? {
        title: copy.confirm.removeTitle,
        description: copy.confirm.removeDescription(agentName),
        note:
          harnessLabels.length > 0 ? (
            <p>{copy.confirm.restoreTo(harnessLabels)}</p>
          ) : undefined,
        confirmLabel: copy.confirm.remove,
        pendingLabel: copy.confirm.removing,
        confirmTone: "primary" as const,
      }
    : {
        title: copy.confirm.deleteTitle,
        description: copy.confirm.deleteDescription(agentName),
        note: (
          <>
            <p>{copy.confirm.cannotUndo}</p>
            {harnessLabels.length > 0 ? (
              <p>{copy.confirm.affectedHarnesses(harnessLabels)}</p>
            ) : null}
          </>
        ),
        confirmLabel: copy.confirm.delete,
        pendingLabel: copy.confirm.deletingAgent,
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
