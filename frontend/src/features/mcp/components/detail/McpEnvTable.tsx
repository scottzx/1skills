import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { McpEnvEntryDto } from "../../api/management-types";

interface McpEnvTableProps {
  entries: McpEnvEntryDto[];
}

export function McpEnvTable({ entries }: McpEnvTableProps) {
  const { t } = useTranslation("mcp");

  if (entries.length === 0) {
    return <p className="muted-text">{t("detail.noEnvValues")}</p>;
  }
  return (
    <div className="mcp-detail__env-table">
      {entries.map((entry) => {
        const rawValue = entry.value ?? "";
        return (
          <div className="mcp-detail__env-row" key={entry.key}>
            <code className="mcp-detail__env-key">{entry.key}</code>
            <div className="mcp-detail__env-value-col">
              <code className="mcp-detail__env-value">{rawValue}</code>
              <div className="mcp-detail__env-tags">
                {entry.isEnvRef ? (
                  <span className="chip chip--verified">
                    <ShieldCheck size={11} aria-hidden="true" />
                    {t("detail.envRef")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
