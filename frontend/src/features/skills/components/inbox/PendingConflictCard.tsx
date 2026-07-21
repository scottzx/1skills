import { useState } from "react";

import { LoadingSpinner } from "../../../../components/LoadingSpinner";
import { useLocale } from "../../../../i18n";
import { useSkillsCopy } from "../../i18n";
import { useResolvePendingConflictMutation } from "../../api/queries";
import { formatVersionCreatedAt } from "../detail/SkillVersionHistoryModal";
import { SkillDiffFileBlock } from "../detail/SkillDiffFiles";
import type { PendingConflictItemDto } from "../../api/types";
import type { SkillDiffFile } from "../../api/types";

interface PendingConflictCardProps {
  item: PendingConflictItemDto;
}

type ResolveAction = "main" | "fork" | "dismiss";
type PendingKind = "create" | "update" | "conflict";

export function PendingConflictCard({ item }: PendingConflictCardProps) {
  const copy = useSkillsCopy();
  const { locale } = useLocale();
  const { conflicts } = copy;
  const resolveMutation = useResolvePendingConflictMutation();
  const [showForkInput, setShowForkInput] = useState(false);
  const [forkName, setForkName] = useState("");

  const kind = ((item as { kind?: PendingKind }).kind ?? "conflict") as PendingKind;
  const allowFork = kind === "conflict";
  const acceptLabel =
    kind === "create" ? conflicts.acceptCreate : kind === "update" ? conflicts.acceptUpdate : conflicts.makeMain;
  const acceptingLabel =
    kind === "create"
      ? conflicts.acceptingCreate
      : kind === "update"
        ? conflicts.acceptingUpdate
        : conflicts.makingMain;

  const pendingAction: ResolveAction | null =
    resolveMutation.isPending && resolveMutation.variables?.conflictId === item.conflictId
      ? (resolveMutation.variables.resolution as ResolveAction)
      : null;

  const baseAdvanced =
    kind !== "create" &&
    item.currentStoreVersion != null &&
    item.currentStoreVersion !== item.storeVersion;
  const diffFiles = (item.diff ?? []) as SkillDiffFile[];

  function resolve(resolution: ResolveAction, name?: string) {
    resolveMutation.mutate({
      conflictId: item.conflictId,
      resolution,
      name: name || undefined,
      baseId: item.baseId ?? undefined,
    });
  }

  const kindLabel =
    kind === "create" ? conflicts.kindCreate : kind === "update" ? conflicts.kindUpdate : conflicts.kindConflict;

  return (
    <article className="pending-conflict-card">
      <div className="pending-conflict-card__header">
        <div className="pending-conflict-card__title-row">
          <h3 className="pending-conflict-card__name">{item.baseName}</h3>
          <span className="card-status-pill card-status-pill--accent">{kindLabel}</span>
          {kind !== "create" ? (
            <>
              <span className="card-status-pill">v{item.storeVersion}</span>
              <span className="card-status-pill">{`base v${item.baseVersion}`}</span>
            </>
          ) : null}
        </div>
        <div className="pending-conflict-card__meta-row">
          <span className="pending-conflict-card__meta">
            {conflicts.workspaceLabel(item.workspaceId ?? item.sourcePath)}
          </span>
          <span className="pending-conflict-card__meta">
            {conflicts.detectedAt(formatVersionCreatedAt(String(item.detectedAt * 1000), locale))}
          </span>
        </div>
        {baseAdvanced ? (
          <p className="pending-conflict-card__warning">{conflicts.baseAdvanced}</p>
        ) : null}
      </div>

      <div className="pending-conflict-card__diff">
        {diffFiles.length > 0 ? (
          diffFiles.map((file) => <SkillDiffFileBlock key={file.path} file={file} copy={copy.versioning} />)
        ) : (
          <p className="skill-versions__empty">{conflicts.noDifferences}</p>
        )}
      </div>

      <div className="pending-conflict-card__actions">
        {showForkInput ? (
          <input
            type="text"
            className="pending-conflict-card__fork-input"
            placeholder={conflicts.forkNamePlaceholder}
            value={forkName}
            onChange={(event) => setForkName(event.target.value)}
            disabled={resolveMutation.isPending}
          />
        ) : null}
        <button
          type="button"
          className="action-pill"
          disabled={resolveMutation.isPending}
          onClick={() => resolve("main")}
        >
          {pendingAction === "main" ? <LoadingSpinner size="sm" label={acceptingLabel} /> : null}
          {pendingAction === "main" ? acceptingLabel : acceptLabel}
        </button>
        {allowFork ? (
          <button
            type="button"
            className="action-pill"
            disabled={resolveMutation.isPending}
            onClick={() => {
              if (!showForkInput) {
                setShowForkInput(true);
                return;
              }
              resolve("fork", forkName.trim());
            }}
          >
            {pendingAction === "fork" ? <LoadingSpinner size="sm" label={conflicts.savingAsFork} /> : null}
            {pendingAction === "fork" ? conflicts.savingAsFork : conflicts.saveAsFork}
          </button>
        ) : null}
        <button
          type="button"
          className="action-pill action-pill--danger"
          disabled={resolveMutation.isPending}
          onClick={() => resolve("dismiss")}
        >
          {pendingAction === "dismiss" ? <LoadingSpinner size="sm" label={conflicts.dismissing} /> : null}
          {pendingAction === "dismiss" ? conflicts.dismissing : conflicts.dismiss}
        </button>
      </div>
    </article>
  );
}
