import { UiTooltip } from "../../../../components/ui/UiTooltip";
import { UiTooltipTriggerBoundary } from "../../../../components/ui/UiTooltipTriggerBoundary";
import type { AgentRemoveStatus } from "../../model/types";

interface AgentDetailRemoveActionProps {
  status: AgentRemoveStatus;
  disabled: boolean;
  onRequestRemove: () => void;
}

export function AgentDetailRemoveAction({
  status,
  disabled,
  onRequestRemove,
}: AgentDetailRemoveActionProps) {
  const isBlocked = disabled || status === "disabled_no_enabled";

  const copy = status === "disabled_no_enabled"
    ? "Enable at least one harness before removing this agent from Skill Manager."
    : "Removes this agent from the Skill Manager store and restores local copies only for the harnesses that are currently enabled.";

  const button = (
    <button
      type="button"
      className="action-pill action-pill--md"
      disabled={isBlocked}
      onClick={status === "available" ? () => {
        onRequestRemove();
      } : undefined}
    >
      Remove from Skill Manager
    </button>
  );

  if (isBlocked) {
    return (
      <div>
        <UiTooltipTriggerBoundary
          content={copy}
          contentClassName="ui-popup--tooltip--hint"
          align="end"
        >
          {button}
        </UiTooltipTriggerBoundary>
        {/* Hover tooltips never open on touch — surface the blocked
            reason as visible text there instead. */}
        <span className="u-touch-hint">{copy}</span>
      </div>
    );
  }

  return (
    <UiTooltip content={copy} contentClassName="ui-popup--tooltip--hint" align="end">
      {button}
    </UiTooltip>
  );
}
