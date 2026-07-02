import { NeedsReviewRow } from "../../../../components/cards/NeedsReviewRow";
import { UiTooltip } from "../../../../components/ui/UiTooltip";
import { getHarnessPresentation } from "../../../../components/harness/harnessPresentation";
import type { StructuralAgentAction } from "../../model/pending";
import type { HarnessCell, AgentListRow } from "../../model/types";

interface AgentNeedsReviewCardProps {
  row: AgentListRow;
  pendingStructuralAction: StructuralAgentAction | null;
  bulkActionPending: boolean;
  selected: boolean;
  onOpenAgent: (agentRef: string) => void;
  onManageAgent: (agentRef: string) => Promise<void>;
}

function HarnessLogo({ cell, zIndex }: { cell: HarnessCell; zIndex: number }) {
  const presentation = getHarnessPresentation(cell.logoKey ?? cell.harness);
  return (
    <UiTooltip content={cell.label}>
      <span className="harness-stack__item" style={{ zIndex }}>
        {presentation ? (
          <img src={presentation.logoSrc} alt="" aria-hidden="true" />
        ) : (
          <span className="harness-stack__fallback">{cell.label.slice(0, 1)}</span>
        )}
      </span>
    </UiTooltip>
  );
}

export function AgentNeedsReviewCard({
  row,
  pendingStructuralAction,
  bulkActionPending,
  selected: _selected,
  onOpenAgent,
  onManageAgent,
}: AgentNeedsReviewCardProps) {
  const found = row.cells.filter((cell) => cell.state === "found");
  const managing = pendingStructuralAction === "manage";
  const metaText = `Found in ${found.length} harness${found.length === 1 ? "" : "es"}`;

  return (
    <NeedsReviewRow
      name={row.name}
      logos={
        <span className="harness-stack">
          {found.map((cell, index) => (
            <HarnessLogo key={cell.harness} cell={cell} zIndex={found.length - index} />
          ))}
        </span>
      }
      metaText={metaText}
      description={row.description}
      actionLabel="Adopt"
      actionTitle={
        row.actions.canManage
          ? "Add this agent to Skill Manager"
          : "This agent cannot be adopted automatically"
      }
      pending={managing}
      actionDisabled={bulkActionPending || pendingStructuralAction !== null || !row.actions.canManage}
      onOpen={() => onOpenAgent(row.agentRef)}
      onAction={() => void onManageAgent(row.agentRef)}
    />
  );
}
