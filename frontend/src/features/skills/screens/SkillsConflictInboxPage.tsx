import { PageHeader } from "../../../components/PageHeader";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { PendingConflictCard } from "../components/inbox/PendingConflictCard";
import { useSkillsCopy } from "../i18n";
import { usePendingConflictsQuery } from "../api/queries";

export default function SkillsConflictInboxPage() {
  const copy = useSkillsCopy();
  const query = usePendingConflictsQuery();
  const conflicts = query.data?.conflicts ?? [];

  return (
    <>
      <div className="page-chrome">
        <PageHeader
          title={copy.conflicts.title}
          subtitle={copy.conflicts.subtitle(conflicts.length)}
        />
      </div>

      {query.isLoading ? (
        <div className="panel-state">
          <LoadingSpinner size="md" label={copy.conflicts.loading} />
        </div>
      ) : query.isError ? (
        <div className="panel-state">{copy.conflicts.unableToLoad}</div>
      ) : conflicts.length > 0 ? (
        <div className="pending-conflict-list">
          {conflicts.map((item) => (
            <PendingConflictCard key={item.conflictId} item={item} />
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <h3 className="empty-panel__title">{copy.conflicts.emptyTitle}</h3>
          <p className="empty-panel__body">{copy.conflicts.emptyBody}</p>
        </div>
      )}
    </>
  );
}
