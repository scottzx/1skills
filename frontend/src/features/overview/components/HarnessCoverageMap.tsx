import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { HarnessAvatar } from "../../../components/harness/HarnessAvatar";
import type { OverviewHarnessRow } from "../../../app/capability-registry";

interface HarnessCoverageMapProps {
  rows: OverviewHarnessRow[];
  loading: boolean;
}

export function HarnessCoverageMap({ rows, loading }: HarnessCoverageMapProps) {
  const { t } = useTranslation("overview");

  return (
    <section className="overview-coverage-map" aria-labelledby="overview-coverage-title">
      <div className="overview-section__head">
        <h2 id="overview-coverage-title">{t("coverageMap.heading")}</h2>
      </div>
      {loading && rows.length === 0 ? (
        <div className="overview-coverage-table" aria-hidden="true">
          <div className="overview-coverage-row overview-coverage-row--skeleton" />
          <div className="overview-coverage-row overview-coverage-row--skeleton" />
          <div className="overview-coverage-row overview-coverage-row--skeleton" />
        </div>
      ) : rows.length > 0 ? (
        <div className="overview-coverage-table">
          <div className="overview-coverage-row overview-coverage-row--head">
            <span>{t("coverageMap.harness")}</span>
            <span>{t("coverageMap.skills")}</span>
            <span>{t("coverageMap.mcp")}</span>
            <span>{t("coverageMap.needsReview")}</span>
          </div>
          {rows.map((row) => (
            <CoverageRow key={row.harness} row={row} />
          ))}
        </div>
      ) : (
        <p className="overview-empty-note">{t("coverageMap.empty")}</p>
      )}
    </section>
  );
}

function CoverageRow({ row }: { row: OverviewHarnessRow }) {
  const { t } = useTranslation("overview");
  const reviewTotal = row.foundSkills + row.unmanagedMcpServers + row.differentConfigMcpServers;
  const unavailableReason = row.mcpWritable === false
    ? (row.mcpUnavailableReason ?? t("coverageMap.mcpUnavailable"))
    : null;

  return (
    <div className="overview-coverage-row">
      <span className="overview-coverage-row__identity">
        <HarnessAvatar harness={row.harness} label={row.label} logoKey={row.logoKey} />
        <span>
          <strong>
            {row.label}
            {unavailableReason ? (
              <span
                className="overview-coverage-warning"
                title={unavailableReason}
                aria-label={unavailableReason}
              >
                <AlertTriangle size={13} />
              </span>
            ) : null}
          </strong>
        </span>
      </span>
      <CoverageCell value={row.enabledSkills} />
      <CoverageCell
        value={row.managedMcpServers}
        detail={differentConfigDetail(row.differentConfigMcpServers, t)}
      />
      <CoverageCell value={reviewTotal} />
    </div>
  );
}

function CoverageCell({
  value,
  detail,
  tone = "normal",
}: {
  value: number;
  detail?: string | null;
  tone?: "normal" | "warning";
}) {
  return (
    <span className="overview-coverage-cell" data-tone={tone} data-active={value > 0}>
      <span className="overview-coverage-cell__dot" aria-hidden="true" />
      <span>{value.toLocaleString()}</span>
      {detail ? <span className="overview-coverage-cell__detail">{detail}</span> : null}
    </span>
  );
}

function differentConfigDetail(value: number, t: ReturnType<typeof useTranslation>["t"]): string | null {
  if (value <= 0) return null;
  return `${value.toLocaleString()} ${t("coverageMap.different")}`;
}