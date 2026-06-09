import * as Dialog from "@radix-ui/react-dialog";

import type { McpIdentityGroupDto } from "../../api/management-types";
import { useMcpCopy } from "../../i18n";
import { McpNeedsReviewDetailView } from "./McpNeedsReviewDetailView";
import { usePortalContainer } from "../../../../lib/portal-container";

interface McpNeedsReviewDetailSheetProps {
  name: string | null;
  group: McpIdentityGroupDto | null;
  isLoading: boolean;
  errorMessage: string;
  pending: boolean;
  onClose: () => void;
  onAdopt: () => void;
  onChooseConfigToAdopt: () => void;
}

export function McpNeedsReviewDetailSheet({
  name,
  onClose,
  ...rest
}: McpNeedsReviewDetailSheetProps) {
  const copy = useMcpCopy();
  const portalContainer = usePortalContainer();
  if (!name) {
    return null;
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal container={portalContainer || undefined}>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="detail-sheet mcp-detail-modal"
          aria-label={copy.detail.sheet.reviewLabel(name)}
        >
          <Dialog.Title className="u-visually-hidden">{copy.detail.sheet.reviewTitle(name)}</Dialog.Title>
          <Dialog.Description className="u-visually-hidden">
            {copy.detail.sheet.reviewDescription}
          </Dialog.Description>
          <McpNeedsReviewDetailView onClose={onClose} {...rest} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
