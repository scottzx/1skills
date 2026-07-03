import { Modal } from "../../../../components/ui/Modal";
import { ErrorBanner } from "../../../../components/ErrorBanner";
import { LoadingSpinner } from "../../../../components/LoadingSpinner";
import { useLocale } from "../../../../i18n";
import { useSkillsCopy } from "../../i18n";
import { useRestoreSkillVersionMutation, useSkillVersionsQuery } from "../../api/queries";
import type { SkillVersionEntry, SkillVersionSource } from "../../api/types";

interface SkillVersionHistoryModalProps {
  open: boolean;
  skillId: string | null;
  onClose: () => void;
}

export function SkillVersionHistoryModal({ open, skillId, onClose }: SkillVersionHistoryModalProps) {
  const copy = useSkillsCopy().versioning;
  const { locale } = useLocale();
  const versionsQuery = useSkillVersionsQuery(open ? skillId : null);
  const restoreMutation = useRestoreSkillVersionMutation();

  const data = versionsQuery.data;
  const versions = data ? sortVersionsDescending(data.versions) : [];
  const errorMessage = versionsQuery.error instanceof Error
    ? versionsQuery.error.message
    : restoreMutation.error instanceof Error
      ? restoreMutation.error.message
      : "";

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
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
                      disabled={isCurrent || !skillId || restoreMutation.isPending}
                      onClick={() => skillId && restoreMutation.mutate({ id: skillId, version: entry.version })}
                    >
                      {isRestoring ? <LoadingSpinner size="sm" label={copy.restoring} /> : null}
                      {isRestoring ? copy.restoring : copy.restore}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function sortVersionsDescending(versions: SkillVersionEntry[]): SkillVersionEntry[] {
  return [...versions].sort((a, b) => b.version - a.version);
}

function versionSourceLabel(source: SkillVersionSource, copy: ReturnType<typeof useSkillsCopy>["versioning"]): string {
  return copy.source[source] ?? source;
}

function formatVersionCreatedAt(value: string, locale: string): string {
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
