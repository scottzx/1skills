import { NeedsReviewRow } from "../../../../components/cards/NeedsReviewRow";
import { UiTooltip } from "../../../../components/ui/UiTooltip";
import { getHarnessPresentation } from "../../../../components/harness/harnessPresentation";
import type { StructuralSkillAction } from "../../model/pending";
import type { HarnessCell, SkillListRow } from "../../model/types";

interface SkillNeedsReviewCardProps {
  row: SkillListRow;
  pendingStructuralAction: StructuralSkillAction | null;
  bulkActionPending: boolean;
  selected: boolean;
  onOpenSkill: (skillRef: string) => void;
  onManageSkill: (skillRef: string) => Promise<void>;
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

export function SkillNeedsReviewCard({
  row,
  pendingStructuralAction,
  bulkActionPending,
  selected: _selected,
  onOpenSkill,
  onManageSkill,
}: SkillNeedsReviewCardProps) {
  const found = row.cells.filter((cell) => cell.state === "found");
  const managing = pendingStructuralAction === "manage";
  const metaText = `Found in ${found.length} harness${found.length === 1 ? "" : "es"}`;
  
  const tagsChip = (row.primaryTag || row.secondaryTag) ? (
    <div className="skill-card__tags" style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginRight: "12px" }}>
      {row.primaryTag ? (
        <span className="tag-badge primary" style={{ background: "rgba(0, 200, 255, 0.15)", color: "#00c8ff", fontSize: "10px", padding: "2px 6px", borderRadius: "3px", fontWeight: "bold" }}>
          {row.primaryTag}
        </span>
      ) : null}
      {row.secondaryTag ? (
        <span className="tag-badge secondary" style={{ background: "rgba(255, 200, 0, 0.15)", color: "#ffc800", fontSize: "10px", padding: "2px 6px", borderRadius: "3px", fontWeight: "bold" }}>
          {row.secondaryTag}
        </span>
      ) : null}
    </div>
  ) : undefined;

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
      statusChip={tagsChip}
      description={row.description}
      actionLabel="Adopt"
      actionTitle={
        row.actions.canManage
          ? "Add this skill to Skill Manager"
          : "This skill cannot be adopted automatically"
      }
      pending={managing}
      actionDisabled={bulkActionPending || pendingStructuralAction !== null || !row.actions.canManage}
      onOpen={() => onOpenSkill(row.skillRef)}
      onAction={() => void onManageSkill(row.skillRef)}
    />
  );
}
