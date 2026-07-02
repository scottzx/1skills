import * as Dialog from "@radix-ui/react-dialog";

import type { HarnessCellState } from "../../model/types";
import type { StructuralAgentAction } from "../../model/pending";
import { AgentDetailView } from "./AgentDetailView";
import { usePortalContainer } from "../../../../lib/portal-container";

interface AgentDetailModalProps {
  open: boolean;
  agentRef: string | null;
  pendingToggleHarnesses: ReadonlySet<string>;
  pendingStructuralAction: StructuralAgentAction | null;
  onClose: () => void;
  onManageAgent: (agentRef: string) => Promise<void>;
  onToggleAgent: (agentRef: string, harness: string, currentState: HarnessCellState) => Promise<void>;
  onUpdateAgent: (agentRef: string) => Promise<void>;
  onRemoveAgent: (agentRef: string) => Promise<void>;
  onDeleteAgent: (agentRef: string) => Promise<void>;
}

export function AgentDetailModal({
  open,
  agentRef,
  pendingToggleHarnesses,
  pendingStructuralAction,
  onClose,
  onManageAgent,
  onToggleAgent,
  onUpdateAgent,
  onRemoveAgent,
  onDeleteAgent,
}: AgentDetailModalProps) {
  const portalContainer = usePortalContainer();
  return (
    <Dialog.Root open={open && Boolean(agentRef)} onOpenChange={(next) => (next ? null : onClose())}>
      <Dialog.Portal container={portalContainer || undefined}>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="detail-sheet skill-detail-modal"
          aria-label="Agent details"
          aria-describedby={undefined}
        >
          <Dialog.Title className="u-visually-hidden">Agent details</Dialog.Title>
          <Dialog.Description className="u-visually-hidden">
            Inspect and manage this agent across harnesses.
          </Dialog.Description>
          {agentRef ? (
            <AgentDetailView
              agentRef={agentRef}
              pendingToggleHarnesses={pendingToggleHarnesses}
              pendingStructuralAction={pendingStructuralAction}
              onClose={onClose}
              onManageAgent={onManageAgent}
              onToggleAgent={onToggleAgent}
              onUpdateAgent={onUpdateAgent}
              onRemoveAgent={onRemoveAgent}
              onDeleteAgent={onDeleteAgent}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
