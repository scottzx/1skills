import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { OverviewReviewItem } from "../../../app/capability-registry";

interface ReviewQueueProps {
  items: OverviewReviewItem[];
  loading: boolean;
}

export function ReviewQueue({ items, loading }: ReviewQueueProps) {
  const { t } = useTranslation("overview");

  return (
    <section className="overview-review-queue" aria-labelledby="overview-review-title">
      <div className="overview-section__head">
        <h2 id="overview-review-title">{t("reviewQueue.heading")}</h2>
      </div>
      {loading ? (
        <div className="overview-review-list" aria-hidden="true">
          <div className="overview-review-row overview-review-row--skeleton" />
          <div className="overview-review-row overview-review-row--skeleton" />
        </div>
      ) : items.length > 0 ? (
        <div className="overview-review-list">
          {items.map((item) => (
            <Link key={item.key} to={item.to} className="overview-review-row" data-tone={item.tone}>
              <span className="overview-review-row__count">{item.count}</span>
              <span className="overview-review-row__copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="overview-review-empty">
          <CheckCircle2 size={18} />
          <span>{t("reviewQueue.empty")}</span>
        </div>
      )}
    </section>
  );
}
