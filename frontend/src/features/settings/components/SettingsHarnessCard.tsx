import { useTranslation } from "react-i18next";

import { ToggleSwitch } from "../../../components/ToggleSwitch";
import { HarnessAvatar } from "../../../components/harness/HarnessAvatar";
import type { SettingsHarness } from "../api/types";

interface SettingsHarnessCardProps {
  harness: SettingsHarness;
  pending: boolean;
  onToggle: (harness: string, nextEnabled: boolean) => void;
}

export function SettingsHarnessCard({ harness, pending, onToggle }: SettingsHarnessCardProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="settings-row">
      <span className="settings-row__icon">
        <HarnessAvatar harness={harness.harness} label={harness.label} logoKey={harness.logoKey} />
      </span>
      <div className="settings-row__body">
        <p className="settings-row__title">{harness.label}</p>
        <p className="settings-row__sub">
          {harness.installed ? t("harnessCard.detected") : t("harnessCard.notDetected")}
        </p>
      </div>
      <div className="settings-row__controls">
        {harness.managedLocation ? (
          <span className="settings-path">{harness.managedLocation}</span>
        ) : null}
        <ToggleSwitch
          checked={harness.supportEnabled}
          disabled={pending}
          label=""
          ariaLabel={t("harnessCard.enable", { name: harness.label })}
          pendingLabel={t("harnessCard.saving")}
          onCheckedChange={(checked) => onToggle(harness.harness, checked)}
        />
      </div>
    </div>
  );
}
