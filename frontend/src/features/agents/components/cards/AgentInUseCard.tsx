import { useMemo } from "react";
import { Loader2, PackageOpen, Power, Trash2 } from "lucide-react";

import { CardMenu, type CardMenuItem } from "../../../../components/cards/CardMenu";
import { useAgentsCopy } from "../../i18n";
import { cellActionKey } from "../../model/pending";
import type { CellActionKey, StructuralAgentAction } from "../../model/pending";
import type { AgentListRow } from "../../model/types";
import { CardTitleRow } from "./CardTitleRow";
import { HarnessChipStack } from "./HarnessChipStack";

interface AgentInUseCardProps {
  row: AgentListRow;
  pendingToggleKeys: ReadonlySet<CellActionKey>;
  pendingStructuralAction: StructuralAgentAction | null;
  selected: boolean;
  checked: boolean;
  onOpenAgent: (agentRef: string) => void;
  onToggleChecked: (agentRef: string) => void;
  onSetAllHarnesses: (
    agentRef: string,
    target: "enabled" | "disabled",
  ) => Promise<unknown> | void;
  onRequestRemove: (row: AgentListRow) => void;
  onRequestDelete: (row: AgentListRow) => void;
}

export function AgentInUseCard({
  row,
  pendingToggleKeys,
  pendingStructuralAction,
  selected,
  checked,
  onOpenAgent,
  onToggleChecked,
  onSetAllHarnesses,
  onRequestRemove,
  onRequestDelete,
}: AgentInUseCardProps) {
  const copy = useAgentsCopy();
  const menuItems = useMemo<CardMenuItem[]>(() => {
    const items: CardMenuItem[] = [];
    if (row.actions.canStopManaging) {
      items.push({
        key: "unmanage",
        label: copy.detail.removeFromSkillManager,
        icon: <PackageOpen size={13} aria-hidden="true" />,
        onSelect: () => onRequestRemove(row),
      });
    }
    if (row.actions.canDelete) {
      items.push({
        key: "delete",
        label: copy.detail.delete,
        icon: <Trash2 size={13} aria-hidden="true" />,
        destructive: true,
        onSelect: () => onRequestDelete(row),
      });
    }
    return items;
  }, [copy.detail.delete, copy.detail.removeFromSkillManager, row, onRequestDelete, onRequestRemove]);

  const interactiveCells = row.cells.filter((cell) => cell.interactive);
  const enabled = interactiveCells.filter((cell) => cell.state === "enabled").length;
  const total = interactiveCells.length;
  const allEnabled = total > 0 && enabled === total;
  const target: "enabled" | "disabled" = allEnabled ? "disabled" : "enabled";
  const anyCellPending = row.cells.some((cell) =>
    pendingToggleKeys.has(cellActionKey(row.agentRef, cell.harness)),
  );
  const setAllDisabled =
    total === 0 || anyCellPending || pendingStructuralAction !== null;

  return (
    <article
      className="skill-card"
      data-selected={selected}
      onClick={() => onOpenAgent(row.agentRef)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenAgent(row.agentRef);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <CardTitleRow
        name={row.name}
        checked={checked}
        onToggleChecked={() => onToggleChecked(row.agentRef)}
        menu={
          <CardMenu
            label={copy.detail.moreActions(row.name)}
            items={menuItems}
            disabled={pendingStructuralAction !== null}
          />
        }
      />

      {row.description ? <p className="skill-card__description">{row.description}</p> : null}

      <div className="skill-card__footer">
        <HarnessChipStack cells={row.cells} />
        <button
          type="button"
          className="action-pill"
          disabled={setAllDisabled}
          onClick={(event) => {
            event.stopPropagation();
            void onSetAllHarnesses(row.agentRef, target);
          }}
          aria-label={target === "enabled" ? copy.detail.enableOnAllAria : copy.detail.disableEverywhere}
        >
          {anyCellPending ? (
            <Loader2 size={12} className="card-action-spinner" aria-hidden="true" />
          ) : (
            <Power size={12} aria-hidden="true" />
          )}
          {target === "enabled" ? copy.detail.enableOnAll : copy.detail.disableEverywhere}
        </button>
      </div>
    </article>
  );
}
