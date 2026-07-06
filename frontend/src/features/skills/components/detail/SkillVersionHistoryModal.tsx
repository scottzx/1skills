import { useState } from "react";

import { Modal } from "../../../../components/ui/Modal";
import { ErrorBanner } from "../../../../components/ErrorBanner";
import { LoadingSpinner } from "../../../../components/LoadingSpinner";
import { useLocale } from "../../../../i18n";
import { useSkillsCopy } from "../../i18n";
import {
  useRestoreSkillVersionMutation,
  useSkillVersionDiffQuery,
  useSkillVersionsQuery,
} from "../../api/queries";
import type { SkillVersionEntry, SkillVersionSource } from "../../api/types";
import { SkillDiffFileBlock } from "./SkillDiffFiles";

interface SkillVersionHistoryModalProps {
  open: boolean;
  skillId: string | null;
  onClose: () => void;
}

const CURRENT_OPTION_VALUE = "current";

export function SkillVersionHistoryModal({ open, skillId, onClose }: SkillVersionHistoryModalProps) {
  const copy = useSkillsCopy().versioning;
  const { locale } = useLocale();
  const versionsQuery = useSkillVersionsQuery(open ? skillId : null);
  const restoreMutation = useRestoreSkillVersionMutation();
  const [diffFromVersion, setDiffFromVersion] = useState<number | null>(null);
  const [diffToVersion, setDiffToVersion] = useState<number | null>(null);

  const data = versionsQuery.data;
  const versions = data ? sortVersionsDescending(data.versions) : [];
  const errorMessage = versionsQuery.error instanceof Error
    ? versionsQuery.error.message
    : restoreMutation.error instanceof Error
      ? restoreMutation.error.message
      : "";

  const diffQuery = useSkillVersionDiffQuery(open ? skillId : null, diffFromVersion, diffToVersion);

  function handleClose() {
    setDiffFromVersion(null);
    setDiffToVersion(null);
    onClose();
  }

  function handleViewChanges(version: number) {
    setDiffFromVersion(version);
    setDiffToVersion(null);
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
      title={copy.historyDialogTitle}
      description={copy.historyDialogDescription}
      size="md"
    >
      <div className="skill-versions">
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
        {versionsQuery.isLoading ? (
          <LoadingSpinner size="sm" label={copy.historyDialogTitle} />
        ) : versionsQuery.isError && !data ? (
          <p className="skill-versions__empty">{copy.unableToLoad}</p>
        ) : versions.length === 0 ? (
          <p className="skill-versions__empty">{copy.noVersions}</p>
        ) : (
          <ul className="skill-versions__list">
            {versions.map((entry) => {
              const isCurrent = data ? entry.version === data.currentVersion : false;
              const isRestoring = restoreMutation.isPending
                && restoreMutation.variables?.id === skillId
                && restoreMutation.variables?.version === entry.version;
              const isViewingChanges = diffFromVersion === entry.version;
              return (
                <li key={entry.version} className="skill-versions__row">
                  <div className="skill-versions__row-main">
                    <span className="skill-versions__version">v{entry.version}</span>
                    <span className="skill-versions__source-tag">{versionSourceLabel(entry.source, copy)}</span>
                    <span className="skill-versions__date">{formatVersionCreatedAt(entry.createdAt, locale)}</span>
                    {isCurrent ? (
                      <span className="card-status-pill card-status-pill--accent">{copy.currentVersion}</span>
                    ) : null}
                  </div>
                  {entry.note ? <p className="skill-versions__note">{entry.note}</p> : null}
                  <div className="skill-versions__row-actions">
                    <button
                      type="button"
                      className="action-pill"
                      aria-pressed={isViewingChanges}
                      onClick={() => handleViewChanges(entry.version)}
                    >
                      {copy.viewChanges}
                    </button>
                    <button
                      type="button"
                      className="action-pill"
                      disabled={isCurrent || !skillId || restoreMutation.isPending}
                      onClick={() => skillId && restoreMutation.mutate({ id: skillId, version: entry.version })}
                    >
                      {isRestoring ? <LoadingSpinner size="sm" label={copy.restoring} /> : null}
                      {isRestoring ? copy.restoring : copy.restore}
                    </button>
                  </div>
                  {isViewingChanges ? (
                    <SkillVersionDiffPanel
                      versions={versions}
                      fromVersion={entry.version}
                      toVersion={diffToVersion}
                      onToVersionChange={setDiffToVersion}
                      diffQuery={diffQuery}
                      copy={copy}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

interface SkillVersionDiffPanelProps {
  versions: SkillVersionEntry[];
  fromVersion: number;
  toVersion: number | null;
  onToVersionChange: (version: number | null) => void;
  diffQuery: ReturnType<typeof useSkillVersionDiffQuery>;
  copy: ReturnType<typeof useSkillsCopy>["versioning"];
}

function SkillVersionDiffPanel({
  versions,
  fromVersion,
  toVersion,
  onToVersionChange,
  diffQuery,
  copy,
}: SkillVersionDiffPanelProps) {
  const compareOptions = versions.filter((entry) => entry.version !== fromVersion);
  const errorMessage = diffQuery.error instanceof Error ? diffQuery.error.message : copy.diffLoadError;

  return (
    <div className="skill-versions__diff">
      <label className="skill-versions__diff-selector">
        <span>{copy.compareAgainst}</span>
        <select
          value={toVersion == null ? CURRENT_OPTION_VALUE : String(toVersion)}
          onChange={(event) => {
            const { value } = event.target;
            onToVersionChange(value === CURRENT_OPTION_VALUE ? null : Number(value));
          }}
        >
          <option value={CURRENT_OPTION_VALUE}>{copy.currentVersionOption}</option>
          {compareOptions.map((entry) => (
            <option key={entry.version} value={entry.version}>
              v{entry.version}
            </option>
          ))}
        </select>
      </label>

      {diffQuery.isLoading ? (
        <LoadingSpinner size="sm" label={copy.viewChanges} />
      ) : diffQuery.isError ? (
        <p className="skill-versions__empty">{errorMessage}</p>
      ) : !diffQuery.data || diffQuery.data.files.length === 0 ? (
        <p className="skill-versions__empty">{copy.noChanges}</p>
      ) : (
        <div className="skill-versions__diff-files">
          {diffQuery.data.files.map((file) => (
            <SkillDiffFileBlock key={file.path} file={file} copy={copy} />
          ))}
        </div>
      )}
    </div>
  );
}

function sortVersionsDescending(versions: SkillVersionEntry[]): SkillVersionEntry[] {
  return [...versions].sort((a, b) => b.version - a.version);
}

function versionSourceLabel(source: SkillVersionSource, copy: ReturnType<typeof useSkillsCopy>["versioning"]): string {
  return copy.source[source] ?? source;
}

export function formatVersionCreatedAt(value: string, locale: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
