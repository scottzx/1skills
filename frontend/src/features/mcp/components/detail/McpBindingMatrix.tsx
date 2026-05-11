import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DetailBindingIdentity,
  type DetailBindingTone,
} from "../../../../components/detail/DetailBindingIdentity";
import type {
  McpBindingDto,
  McpInventoryColumnDto,
} from "../../api/management-types";
import { isMcpHarnessAddressable } from "../../model/selectors";

interface McpBindingMatrixProps {
  columns: McpInventoryColumnDto[];
  bindings: McpBindingDto[];
  canEnable: boolean;
  serverPending: boolean;
  pendingPerHarness: ReadonlySet<string>;
  onEnable: (harness: string) => void;
  onDisable: (harness: string) => void;
  onResolveConfigClick: () => void;
  canResolveConfig: boolean;
}

function harnessBindingMap(bindings: McpBindingDto[]): Map<string, McpBindingDto> {
  const map = new Map<string, McpBindingDto>();
  for (const binding of bindings) {
    map.set(binding.harness, binding);
  }
  return map;
}

function stateTone(state: McpBindingDto["state"]): DetailBindingTone {
  if (state === "managed") return "enabled";
  if (state === "drifted" || state === "unmanaged") return "warning";
  return "disabled";
}

export function McpBindingMatrix({
  columns,
  bindings,
  canEnable,
  serverPending,
  pendingPerHarness,
  onEnable,
  onDisable,
  onResolveConfigClick,
  canResolveConfig,
}: McpBindingMatrixProps) {
  const { t } = useTranslation("mcp");

  const map = harnessBindingMap(bindings);
  const observedHarnesses = new Set(
    bindings.filter((binding) => binding.state !== "missing").map((binding) => binding.harness),
  );
  const addressableColumns = columns.filter(
    (column) => isMcpHarnessAddressable(column) || observedHarnesses.has(column.harness),
  );

  function stateLabel(state: McpBindingDto["state"]): string {
    switch (state) {
      case "managed":
        return t("bindingMatrix.enabled");
      case "drifted":
        return t("bindingMatrix.differentConfig");
      case "missing":
        return t("bindingMatrix.disabled");
      case "unmanaged":
        return t("bindingMatrix.foundInHarness");
      default:
        return state;
    }
  }

  function visibleStateLabel(state: McpBindingDto["state"]): string | null {
    if (state === "drifted") return t("bindingMatrix.differentConfig");
    if (state === "unmanaged") return t("bindingMatrix.foundInHarness");
    return null;
  }

  return (
    <div className="detail-sheet__bindings">
      {addressableColumns.map((column) => {
        const binding = map.get(column.harness);
        const state = binding?.state ?? "missing";
        const pending = pendingPerHarness.has(column.harness) || serverPending;
        const canWriteConfig = isMcpHarnessAddressable(column);
        return (
          <div
            key={column.harness}
            className="detail-sheet__binding-row"
            data-state={state}
            data-pending={pending || undefined}
          >
            <DetailBindingIdentity
              harness={column.harness}
              label={column.label}
              logoKey={column.logoKey}
              statusLabel={stateLabel(state)}
              tone={stateTone(state)}
              visibleStatus={visibleStateLabel(state)}
              detail={state === "drifted" ? binding?.driftDetail : null}
            />
            <div className="detail-sheet__binding-actions">
              {state === "missing" ? (
                <button
                  type="button"
                  className={canEnable ? "action-pill action-pill--accent" : "action-pill"}
                  onClick={() => {
                    if (canEnable && canWriteConfig) onEnable(column.harness);
                  }}
                  disabled={pending || !canEnable || !canWriteConfig}
                  title={!canWriteConfig ? column.mcpUnavailableReason ?? undefined : undefined}
                >
                  {pending ? (
                    <Loader2
                      size={12}
                      className="card-action-spinner"
                      aria-hidden="true"
                    />
                  ) : null}
                  {canEnable && canWriteConfig ? t("bindingMatrix.enable") : t("bindingMatrix.unavailable")}
                </button>
              ) : null}
              {state === "managed" ? (
                <button
                  type="button"
                  className="action-pill action-pill--danger"
                  onClick={() => onDisable(column.harness)}
                  disabled={pending}
                >
                  {pending ? (
                    <Loader2
                      size={12}
                      className="card-action-spinner"
                      aria-hidden="true"
                    />
                  ) : null}
                  {t("bindingMatrix.disable")}
                </button>
              ) : null}
              {state === "drifted" ? (
                <button
                  type="button"
                  className="action-pill action-pill--accent"
                  onClick={onResolveConfigClick}
                  disabled={pending || !canResolveConfig}
                >
                  {pending ? (
                    <Loader2
                      size={12}
                      className="card-action-spinner"
                      aria-hidden="true"
                    />
                  ) : null}
                  {t("bindingMatrix.resolveConfig")}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
