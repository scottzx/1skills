import { CardSelectCheckbox } from "../../../../components/cards/CardSelectCheckbox";
import { OverflowTooltipText } from "../../../../components/ui/OverflowTooltipText";
import { HarnessChipStack } from "../cards/HarnessChipStack";
import { cellActionKey } from "../../model/pending";
import type { CellActionKey } from "../../model/pending";
import type {
  HarnessCell as HarnessCellType,
  HarnessColumn,
  AgentListRow,
} from "../../model/types";
import { AgentMatrixHarnessCell } from "./AgentMatrixHarnessCell";

interface MatrixRowProps {
  row: AgentListRow;
  harnessColumns: HarnessColumn[];
  checked: boolean;
  selected: boolean;
  pendingToggleKeys: ReadonlySet<CellActionKey>;
  onOpenAgent: (agentRef: string) => void;
  onToggleChecked: (agentRef: string) => void;
  onToggleCell: (row: AgentListRow, cell: HarnessCellType) => void;
}

function findCell(row: AgentListRow, harness: string): HarnessCellType {
  return (
    row.cells.find((cell) => cell.harness === harness) ?? {
      harness,
      label: harness,
      state: "empty",
      interactive: false,
    }
  );
}

function countEnabled(row: AgentListRow): number {
  let count = 0;
  for (const cell of row.cells) if (cell.state === "enabled") count += 1;
  return count;
}

export function MatrixRow({
  row,
  harnessColumns,
  checked,
  selected,
  pendingToggleKeys,
  onOpenAgent,
  onToggleChecked,
  onToggleCell,
}: MatrixRowProps) {
  const enabledCount = countEnabled(row);
  const totalCount = harnessColumns.length;

  return (
    <tr
      className="matrix-table__row"
      data-selected={selected ? "true" : undefined}
      data-checked={checked ? "true" : undefined}
    >
      <td className="matrix-table__cell matrix-table__cell--checkbox">
        <CardSelectCheckbox
          checked={checked}
          label={checked ? `Deselect ${row.name}` : `Select ${row.name}`}
          onToggle={() => onToggleChecked(row.agentRef)}
        />
      </td>

      <td
        className="matrix-table__cell matrix-table__cell--identity"
        onClick={() => onOpenAgent(row.agentRef)}
      >
        <div className="matrix-table__name-row">
          <OverflowTooltipText as="span" className="matrix-table__name-text">
            {row.name}
          </OverflowTooltipText>
        </div>
        {row.description ? (
          <OverflowTooltipText as="p" className="matrix-table__description">
            {row.description}
          </OverflowTooltipText>
        ) : null}
      </td>

      {harnessColumns.map((column) => {
        const cell = findCell(row, column.harness);
        const pending = pendingToggleKeys.has(cellActionKey(row.agentRef, cell.harness));
        return (
          <td key={column.harness} className="matrix-table__cell matrix-table__cell--harness">
            <AgentMatrixHarnessCell
              cell={cell}
              agentName={row.name}
              pending={pending}
              onToggle={(next) => onToggleCell(row, next)}
            />
          </td>
        );
      })}

      <td className="matrix-table__cell matrix-table__cell--compact">
        <HarnessChipStack cells={row.cells} />
      </td>

      <td className="matrix-table__cell matrix-table__cell--coverage">
        <span className="matrix-table__coverage" aria-label={`Active on ${enabledCount} of ${totalCount} harnesses`}>
          <span className="matrix-table__coverage-count">{enabledCount}</span>
          <span className="matrix-table__coverage-total" aria-hidden="true">
            {" / "}
            {totalCount}
          </span>
        </span>
      </td>
    </tr>
  );
}
