import type { AgentsCopy } from "../../i18n";

interface AgentsEmptyStateProps {
  copy: AgentsCopy["filters"];
  onResetFilters: () => void;
}

export function AgentsEmptyState({ copy, onResetFilters }: AgentsEmptyStateProps) {
  return (
    <div className="skills-empty-state">
      <div>
        <h3>{copy.noMatchTitle}</h3>
        <p>{copy.noMatchBody}</p>
      </div>
      <button
        type="button"
        className="action-pill action-pill--md"
        onClick={onResetFilters}
      >
        {copy.clearFilters}
      </button>
    </div>
  );
}
