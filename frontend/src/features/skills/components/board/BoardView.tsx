import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import { BoardColumn } from "./BoardColumn";
import { BoardSkillCard } from "./BoardSkillCard";
import { useToast } from "../../../../components/Toast";
import { bucketForRow, bucketRows, type SkillBucket } from "../../model/bucketForRow";
import { hasPendingToggleForSkill } from "../../model/pending";
import type { CellActionKey } from "../../model/pending";
import type { SkillListRow } from "../../model/types";
import type { SetAllHarnessesResult, SetAllHarnessesTarget } from "../../model/workspace-context";

interface BoardViewProps {
  rows: SkillListRow[];
  checkedRefs: ReadonlySet<string>;
  pendingToggleKeys: ReadonlySet<CellActionKey>;
  onOpenSkill: (skillRef: string) => void;
  onToggleChecked: (skillRef: string) => void;
  onClearMultiSelect: () => void;
  onSetSkillAllHarnesses: (skillRef: string, target: SetAllHarnessesTarget) => Promise<SetAllHarnessesResult>;
  onSetManySkillsAllHarnesses: (
    skillRefs: string[],
    target: SetAllHarnessesTarget,
  ) => Promise<Map<string, SetAllHarnessesResult>>;
}

const TERMINAL_BUCKETS: ReadonlySet<SkillBucket> = new Set(["enabled", "disabled"]);

function isTerminalBucket(value: unknown): value is "enabled" | "disabled" {
  return value === "enabled" || value === "disabled";
}

export function BoardView({
  rows,
  checkedRefs,
  pendingToggleKeys,
  onOpenSkill,
  onToggleChecked,
  onClearMultiSelect,
  onSetSkillAllHarnesses,
  onSetManySkillsAllHarnesses,
}: BoardViewProps) {
  const { t } = useTranslation("skills");
  const { toast } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [transitionTarget, setTransitionTarget] = useState<Map<string, "enabled" | "disabled">>(() => new Map());

  // Clear a pin once all of the skill's cells have settled (no pending toggles).
  useEffect(() => {
    if (transitionTarget.size === 0) return;
    let next: Map<string, "enabled" | "disabled"> | null = null;
    for (const skillRef of transitionTarget.keys()) {
      if (!hasPendingToggleForSkill(pendingToggleKeys, skillRef)) {
        if (next === null) next = new Map(transitionTarget);
        next.delete(skillRef);
      }
    }
    if (next !== null) {
      setTransitionTarget(next);
    }
  }, [pendingToggleKeys, transitionTarget]);

  const buckets = useMemo(() => {
    const base = bucketRows(rows);
    if (transitionTarget.size === 0) {
      return base;
    }
    // Move any pinned skill out of its natural bucket into the target one.
    const pinned = new Map<string, SkillListRow>();
    for (const row of rows) {
      if (transitionTarget.has(row.skillRef)) {
        pinned.set(row.skillRef, row);
      }
    }
    if (pinned.size === 0) return base;
    const strip = (list: SkillListRow[]) => list.filter((row) => !pinned.has(row.skillRef));
    const rebucketed = {
      disabled: strip(base.disabled),
      selective: strip(base.selective),
      enabled: strip(base.enabled),
    };
    for (const [skillRef, row] of pinned) {
      const target = transitionTarget.get(skillRef)!;
      rebucketed[target].push(row);
    }
    return rebucketed;
  }, [rows, transitionTarget]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const target = over.id;
      if (!isTerminalBucket(target)) return;

      const activeRef = String(active.id);
      const isMultiDrag = checkedRefs.has(activeRef) && checkedRefs.size > 1;

      if (!isMultiDrag) {
        const row = rows.find((candidate) => candidate.skillRef === activeRef);
        if (!row) return;

        const currentBucket = bucketForRow(row);
        if (TERMINAL_BUCKETS.has(currentBucket) && currentBucket === target) {
          return;
        }

        setTransitionTarget((prev) => {
          const next = new Map(prev);
          next.set(activeRef, target);
          return next;
        });

        void onSetSkillAllHarnesses(activeRef, target).then((result) => {
          const total = result.succeeded.length + result.failed.length;
          if (result.failed.length === 0 && result.succeeded.length > 0) {
            toast(
              target === "enabled"
                ? t("board.enabledToast", { name: row.name })
                : t("board.disabledToast", { name: row.name }),
            );
          } else if (result.succeeded.length > 0 && result.failed.length > 0) {
            toast(
              target === "enabled"
                ? t("board.partiallyEnabledToast", { name: row.name, succeeded: result.succeeded.length, total })
                : t("board.partiallyDisabledToast", { name: row.name, succeeded: result.succeeded.length, total }),
            );
          }
        });
        return;
      }

      // Multi-drag: all checked skills flip together.
      const targetRefs = Array.from(checkedRefs);
      const refsNeedingFlip = targetRefs.filter((ref) => {
        const row = rows.find((candidate) => candidate.skillRef === ref);
        if (!row) return false;
        const currentBucket = bucketForRow(row);
        return !(TERMINAL_BUCKETS.has(currentBucket) && currentBucket === target);
      });
      if (refsNeedingFlip.length === 0) {
        onClearMultiSelect();
        return;
      }

      setTransitionTarget((prev) => {
        const next = new Map(prev);
        for (const ref of refsNeedingFlip) {
          next.set(ref, target);
        }
        return next;
      });

      void onSetManySkillsAllHarnesses(refsNeedingFlip, target).then((resultsByRef) => {
        const changed = Array.from(resultsByRef.values()).filter(
          (r) => r.succeeded.length > 0 || r.failed.length > 0,
        );
        const fullySucceeded = changed.filter((r) => r.failed.length === 0);
        const withFailures = changed.filter((r) => r.failed.length > 0);
        const total = changed.length;

        if (total === 0) {
          // No-op (every skill already in the target bucket).
        } else if (withFailures.length === 0) {
          toast(
            target === "enabled"
              ? t("board.enabledCountToast", { count: fullySucceeded.length })
              : t("board.disabledCountToast", { count: fullySucceeded.length }),
          );
        } else if (fullySucceeded.length > 0) {
          toast(
            target === "enabled"
              ? t("board.enabledPartialCountToast", { succeeded: fullySucceeded.length, total })
              : t("board.disabledPartialCountToast", { succeeded: fullySucceeded.length, total }),
          );
        }
        // Full-failure case is surfaced via actionErrorMessage banner; no toast.
        onClearMultiSelect();
      });
    },
    [checkedRefs, onClearMultiSelect, onSetManySkillsAllHarnesses, onSetSkillAllHarnesses, rows, t, toast],
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="skill-board" role="group" aria-label={t("board.ariaLabel")}>
        <BoardColumn
          kind="disabled"
          title={t("board.disabledTitle")}
          description={t("board.disabledDescriptionShort")}
          count={buckets.disabled.length}
          emptyMessage={t("board.noDisabledMessage")}
        >
          {buckets.disabled.map((row) => (
            <BoardSkillCard
              key={row.skillRef}
              row={row}
              checked={checkedRefs.has(row.skillRef)}
              pending={hasPendingToggleForSkill(pendingToggleKeys, row.skillRef)}
              multiDragCount={checkedRefs.size}
              onOpenSkill={onOpenSkill}
              onToggleChecked={onToggleChecked}
            />
          ))}
        </BoardColumn>

        <BoardColumn
          kind="selective"
          title={t("board.selective")}
          description={t("board.selectiveDescription")}
          count={buckets.selective.length}
          emptyMessage={t("board.noSelectiveMessage")}
        >
          {buckets.selective.map((row) => (
            <BoardSkillCard
              key={row.skillRef}
              row={row}
              checked={checkedRefs.has(row.skillRef)}
              pending={hasPendingToggleForSkill(pendingToggleKeys, row.skillRef)}
              multiDragCount={checkedRefs.size}
              onOpenSkill={onOpenSkill}
              onToggleChecked={onToggleChecked}
            />
          ))}
        </BoardColumn>

        <BoardColumn
          kind="enabled"
          title={t("board.enabledTitle")}
          description={t("board.enabledDescription")}
          count={buckets.enabled.length}
          emptyMessage={t("board.noEnabledMessage")}
        >
          {buckets.enabled.map((row) => (
            <BoardSkillCard
              key={row.skillRef}
              row={row}
              checked={checkedRefs.has(row.skillRef)}
              pending={hasPendingToggleForSkill(pendingToggleKeys, row.skillRef)}
              multiDragCount={checkedRefs.size}
              onOpenSkill={onOpenSkill}
              onToggleChecked={onToggleChecked}
            />
          ))}
        </BoardColumn>
      </div>
    </DndContext>
  );
}
