import type { StructuralAgentAction } from "../../model/pending";
import type { AgentListRow } from "../../model/types";
import { useAgentsCopy } from "../../i18n";
import { AgentNeedsReviewCard } from "./AgentNeedsReviewCard";

interface AgentsNeedsReviewListProps {
  rows: AgentListRow[];
  pendingStructuralActions: ReadonlyMap<string, StructuralAgentAction>;
  bulkActionPending: boolean;
  selectedAgentRef: string | null;
  onOpenAgent: (agentRef: string) => void;
  onManageAgent: (agentRef: string) => Promise<void>;
}

export function AgentsNeedsReviewList({
  rows,
  pendingStructuralActions,
  bulkActionPending,
  selectedAgentRef,
  onOpenAgent,
  onManageAgent,
}: AgentsNeedsReviewListProps) {
  const copy = useAgentsCopy();

  return (
    <section className="needs-review-rows" aria-label={copy.detail.reviewList}>
      {rows.map((row) => (
        <AgentNeedsReviewCard
          key={row.agentRef}
          row={row}
          pendingStructuralAction={pendingStructuralActions.get(row.agentRef) ?? null}
          bulkActionPending={bulkActionPending}
          selected={selectedAgentRef === row.agentRef}
          onOpenAgent={onOpenAgent}
          onManageAgent={onManageAgent}
        />
      ))}
    </section>
  );
}
