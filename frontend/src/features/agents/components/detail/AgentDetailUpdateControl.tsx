import { LoadingSpinner } from "../../../../components/LoadingSpinner";
import type { AgentUpdateStatus } from "../../model/types";

interface AgentDetailUpdateControlProps {
  updateStatus: AgentUpdateStatus;
  pending: boolean;
  disabled: boolean;
  onUpdate: () => void;
}

const UPDATE_STATUS_LABELS: Record<Exclude<AgentUpdateStatus, "update_available" | "local_changes_detected">, string> = {
  no_update_available: "No Update Available",
  no_source_available: "No Source Available",
};

export function AgentDetailUpdateControl({
  updateStatus,
  pending,
  disabled,
  onUpdate,
}: AgentDetailUpdateControlProps) {
  if (updateStatus === "update_available") {
    return (
      <button
        type="button"
        className="action-pill action-pill--md skill-detail__update-control"
        disabled={disabled}
        onClick={onUpdate}
      >
        {pending ? <LoadingSpinner size="sm" label="Updating agent" /> : null}
        Update From Source
      </button>
    );
  }

  if (updateStatus === "local_changes_detected") {
    return null;
  }

  return (
    <span className="card-status-pill card-status-pill--md skill-detail__update-control">
      {UPDATE_STATUS_LABELS[updateStatus]}
    </span>
  );
}
