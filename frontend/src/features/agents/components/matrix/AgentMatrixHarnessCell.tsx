import {
  MatrixHarnessCellTarget,
  MatrixHarnessIcon,
} from "../../../../components/matrix";
import { UiTooltip } from "../../../../components/ui/UiTooltip";
import type { HarnessCell as HarnessCellType } from "../../model/types";

interface AgentMatrixHarnessCellProps {
  cell: HarnessCellType;
  agentName: string;
  pending?: boolean;
  onToggle: (cell: HarnessCellType) => void;
}

export function AgentMatrixHarnessCell({
  cell,
  agentName,
  pending = false,
  onToggle,
}: AgentMatrixHarnessCellProps) {
  if (cell.state === "empty" || cell.state === "found") {
    return (
      <span className="matrix-harness-target" data-state="empty" aria-hidden="true">
        —
      </span>
    );
  }

  const isEnabled = cell.state === "enabled";
  const action = isEnabled ? "Disable" : "Enable";

  const button = (
    <MatrixHarnessCellTarget
      ariaLabel={`${action} ${agentName} on ${cell.label}`}
      ariaPressed={isEnabled}
      state={cell.state}
      pending={pending}
      disabled={pending}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(cell);
      }}
    >
      <MatrixHarnessIcon
        label={cell.label}
        logoKey={cell.logoKey}
        harness={cell.harness}
      />
    </MatrixHarnessCellTarget>
  );

  return (
    <UiTooltip content={`${cell.label} — ${isEnabled ? "enabled" : "disabled"}`}>
      {button}
    </UiTooltip>
  );
}
