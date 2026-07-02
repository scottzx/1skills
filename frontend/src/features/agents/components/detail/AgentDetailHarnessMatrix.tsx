import { Loader2 } from "lucide-react";

import {
  DetailBindingIdentity,
  type DetailBindingTone,
} from "../../../../components/detail/DetailBindingIdentity";
import type { StructuralAgentAction } from "../../model/pending";
import type { HarnessCell, HarnessCellState } from "../../model/types";

interface AgentDetailHarnessMatrixProps {
  agentName: string;
  cells: HarnessCell[];
  pendingToggleHarnesses: ReadonlySet<string>;
  pendingStructuralAction: StructuralAgentAction | null;
  onToggleCell: (cell: HarnessCell) => void;
}

const STATE_LABEL: Record<HarnessCellState, string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  found: "Found in harness",
  empty: "Not present",
};

const STATE_TONE: Record<HarnessCellState, DetailBindingTone> = {
  enabled: "enabled",
  disabled: "disabled",
  found: "warning",
  empty: "disabled",
};

function visibleStateLabel(state: HarnessCellState): string | null {
  return state === "found" ? STATE_LABEL[state] : null;
}

export function AgentDetailHarnessMatrix({
  agentName,
  cells,
  pendingToggleHarnesses,
  pendingStructuralAction,
  onToggleCell,
}: AgentDetailHarnessMatrixProps) {
  if (cells.length === 0) {
    return null;
  }
  const structuralLocked = pendingStructuralAction !== null;

  return (
    <div className="detail-sheet__bindings" aria-label={`Harness access for ${agentName}`}>
      {cells.map((cell) => {
        const pending = pendingToggleHarnesses.has(cell.harness);
        return (
          <div
            key={cell.harness}
            className="detail-sheet__binding-row"
            data-state={cell.state}
            data-pending={pending || undefined}
          >
            <DetailBindingIdentity
              harness={cell.harness}
              label={cell.label}
              logoKey={cell.logoKey}
              statusLabel={STATE_LABEL[cell.state]}
              tone={STATE_TONE[cell.state]}
              visibleStatus={visibleStateLabel(cell.state)}
            />
            <div className="detail-sheet__binding-actions">
              <HarnessCellAction
                agentName={agentName}
                cell={cell}
                pending={pending}
                disabled={structuralLocked}
                onToggleCell={onToggleCell}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface HarnessCellActionProps {
  agentName: string;
  cell: HarnessCell;
  pending: boolean;
  disabled: boolean;
  onToggleCell: (cell: HarnessCell) => void;
}

function HarnessCellAction({
  agentName,
  cell,
  pending,
  disabled,
  onToggleCell,
}: HarnessCellActionProps) {
  if (!cell.interactive) {
    if (cell.state === "found") {
      return (
        <span className="detail-sheet__binding-hint">
          Adopt this agent to manage it
        </span>
      );
    }
    return null;
  }

  if (cell.state === "enabled") {
    return (
      <button
        type="button"
        className="action-pill action-pill--danger"
        disabled={disabled || pending}
        onClick={() => onToggleCell(cell)}
        aria-label={`Disable ${agentName} for ${cell.label}`}
      >
        {pending ? (
          <Loader2 size={12} className="card-action-spinner" aria-hidden="true" />
        ) : null}
        Disable
      </button>
    );
  }

  if (cell.state === "disabled") {
    return (
      <button
        type="button"
        className="action-pill action-pill--accent"
        disabled={disabled || pending}
        onClick={() => onToggleCell(cell)}
        aria-label={`Enable ${agentName} for ${cell.label}`}
      >
        {pending ? (
          <Loader2 size={12} className="card-action-spinner" aria-hidden="true" />
        ) : null}
        Enable
      </button>
    );
  }

  return null;
}
