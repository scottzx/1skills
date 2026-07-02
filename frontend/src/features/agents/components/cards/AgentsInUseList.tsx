import type { CellActionKey, StructuralAgentAction } from "../../model/pending";
import type { AgentListRow } from "../../model/types";
import { useAgentsCopy } from "../../i18n";
import { AgentInUseCard } from "./AgentInUseCard";

interface AgentsInUseListProps {
  ariaLabel?: string;
  rows: AgentListRow[];
  pendingToggleKeys: ReadonlySet<CellActionKey>;
  pendingStructuralActions: ReadonlyMap<string, StructuralAgentAction>;
  selectedAgentRef: string | null;
  checkedRefs: ReadonlySet<string>;
  onOpenAgent: (agentRef: string) => void;
  onToggleChecked: (agentRef: string) => void;
  onSetAllHarnesses: (
    agentRef: string,
    target: "enabled" | "disabled",
  ) => Promise<unknown> | void;
  onRequestRemove: (row: AgentListRow) => void;
  onRequestDelete: (row: AgentListRow) => void;
}

export function AgentsInUseList({
  ariaLabel,
  rows,
  pendingToggleKeys,
  pendingStructuralActions,
  selectedAgentRef,
  checkedRefs,
  onOpenAgent,
  onToggleChecked,
  onSetAllHarnesses,
  onRequestRemove,
  onRequestDelete,
}: AgentsInUseListProps) {
  const copy = useAgentsCopy();

  return (
    <section className="skill-grid" aria-label={ariaLabel ?? copy.detail.inUseList}>
      {rows.map((row) => (
        <AgentInUseCard
          key={row.agentRef}
          row={row}
          pendingToggleKeys={pendingToggleKeys}
          pendingStructuralAction={pendingStructuralActions.get(row.agentRef) ?? null}
          selected={selectedAgentRef === row.agentRef}
          checked={checkedRefs.has(row.agentRef)}
          onOpenAgent={onOpenAgent}
          onToggleChecked={onToggleChecked}
          onSetAllHarnesses={onSetAllHarnesses}
          onRequestRemove={onRequestRemove}
          onRequestDelete={onRequestDelete}
        />
      ))}
    </section>
  );
}
