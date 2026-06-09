import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { useBreakpoint } from "../../lib/use-breakpoint";
import { useCommonCopy } from "../../i18n";

export type ModalSize = "sm" | "md" | "lg" | "xl";

/**
 * Render shape. `dialog` keeps the centered fixed position. `sheet-auto`
 * flips to a bottom sheet automatically on `compact` viewports, otherwise
 * renders as a centered dialog.
 */
export type ModalMode = "dialog" | "sheet-auto";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  size?: ModalSize;
  mode?: ModalMode;
  /** Optional action row rendered at the bottom. */
  footer?: ReactNode;
  /** Main body content. */
  children: ReactNode;
  /**
   * When true, disables outside-click and escape-key dismissal (e.g. while
   * a confirm action is in flight). Callers can still close by setting
   * `open` to false.
   */
  dismissDisabled?: boolean;
}

/**
 * Shared modal primitive wrapping Radix Dialog.
 *
 * CSS hooks for size and render shape are exposed via `data-size` and
 * `data-render` attributes on the content element. The actual size/shape
 * rules live in `styles/components/dialogs.css` and read the `--modal-width-*`
 * tokens defined in `styles/tokens.css`.
 *
 * For Phase 0 the component renders with the existing `dialog-content` base
 * class so it looks identical to hand-rolled dialogs; Phase 2 layers the
 * sheet/dialog auto-switch on top.
 */
import { usePortalContainer } from "../../lib/portal-container";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  mode = "dialog",
  footer,
  children,
  dismissDisabled = false,
}: ModalProps) {
  const common = useCommonCopy();
  const isCompact = useBreakpoint("compact");
  const renderAsSheet = mode === "sheet-auto" && isCompact;
  const portalContainer = usePortalContainer();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={dismissDisabled ? undefined : onOpenChange}
    >
      <Dialog.Portal container={portalContainer || undefined}>
        <Dialog.Overlay
          className="dialog-overlay"
          data-render={renderAsSheet ? "sheet" : "dialog"}
        />
        <Dialog.Content
          className="dialog-content modal"
          data-size={size}
          data-render={renderAsSheet ? "sheet" : "dialog"}
          onEscapeKeyDown={(event) => {
            if (dismissDisabled) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (dismissDisabled) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (dismissDisabled) event.preventDefault();
          }}
        >
          <div className="modal__chrome">
            <Dialog.Title className="modal__title">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="modal__close"
                aria-label={common.nav.close}
                disabled={dismissDisabled}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="modal__description">
              {description}
            </Dialog.Description>
          ) : null}
          <div className="modal__body">{children}</div>
          {footer ? <div className="modal__footer">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
