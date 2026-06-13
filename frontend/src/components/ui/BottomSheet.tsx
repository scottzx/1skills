import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

import { useCommonCopy } from "../../i18n";

import { usePortalContainer } from "../../lib/portal-container";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Optional action row rendered at the bottom. */
  footer?: ReactNode;
  /**
   * Maximum height as a fraction of viewport height. Defaults to 0.92 (92dvh).
   * The sheet's `max-height` is the consumer's concern; this prop just lets
   * the caller set it without reaching into the DOM.
   */
  maxHeight?: string;
}

/**
 * Standalone bottom sheet. Use when a UI surface (filter menu, picker,
 * preview) should slide up from the bottom regardless of viewport. For
 * modals that should auto-switch to a sheet on compact, use
 * `<Modal mode="sheet-auto">` instead.
 *
 * Wraps Radix Dialog for focus trap + escape dismiss. The sheet itself
 * uses `--sheet-*` tokens and the `data-render="sheet"` hook so CSS can
 * apply the bottom-anchored shape consistently.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  maxHeight = "var(--sheet-max-height)",
}: BottomSheetProps) {
  const common = useCommonCopy();
  const portalContainer = usePortalContainer();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portalContainer || undefined}>
        <Dialog.Overlay
          className="dialog-overlay"
          data-render="sheet"
        />
        <Dialog.Content
          className="dialog-content bottom-sheet"
          data-render="sheet"
          style={{ maxHeight }}
          aria-describedby={undefined}
        >
          <div className="bottom-sheet__handle" aria-hidden="true" />
          <div className="bottom-sheet__chrome">
            <Dialog.Title className="bottom-sheet__title">{title}</Dialog.Title>
          </div>
          {description ? (
            <Dialog.Description className="bottom-sheet__description">
              {description}
            </Dialog.Description>
          ) : null}
          <div className="bottom-sheet__body">{children}</div>
          {footer ? <div className="bottom-sheet__footer">{footer}</div> : null}
          <span className="u-visually-hidden">{common.nav.close}</span>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
