import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

import { LoadingSpinner } from "./LoadingSpinner";
import { Modal } from "./ui/Modal";
import { useCommonCopy } from "../i18n";

interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  note?: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  isPending: boolean;
  confirmTone?: "primary" | "danger";
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  note,
  confirmLabel,
  pendingLabel,
  isPending,
  confirmTone = "danger",
  onOpenChange,
  onConfirm,
}: ConfirmActionDialogProps) {
  const common = useCommonCopy();

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      mode="sheet-auto"
      dismissDisabled={isPending}
      footer={
        <div className="dialog-actions confirm-dialog__actions">
          <button
            type="button"
            className="btn confirm-dialog__button confirm-dialog__button--cancel"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {common.actions.cancel}
          </button>
          <button
            type="button"
            className={`btn confirm-dialog__button confirm-dialog__button--${confirmTone}`}
            disabled={isPending}
            onClick={() => {
              void onConfirm();
            }}
          >
            {isPending ? <LoadingSpinner size="sm" label={pendingLabel} /> : null}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <Dialog.Description className="dialog-description confirm-dialog__description">
        {description}
      </Dialog.Description>
      {note ? <div className="confirm-dialog__note">{note}</div> : null}
    </Modal>
  );
}
