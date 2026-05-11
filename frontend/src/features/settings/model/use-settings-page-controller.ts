import { useState } from "react";

import { usePendingRegistry } from "../../../lib/async/pending-registry";
import i18n from "../../../i18n/config";
import {
  useHarnessSupportMutation,
  useSettingsQuery,
} from "../queries";
import { settingsSupportActionKey } from "./pending";

export function useSettingsPageController() {
  const [errorMessage, setErrorMessage] = useState("");
  const settingsQuery = useSettingsQuery();
  const supportMutation = useHarnessSupportMutation();
  const pendingRegistry = usePendingRegistry<string>();

  async function handleSupportToggle(harness: string, nextEnabled: boolean) {
    setErrorMessage("");
    try {
      await pendingRegistry.run(
        settingsSupportActionKey(harness),
        () => supportMutation.mutateAsync({ harness, enabled: nextEnabled }),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update harness support.");
    }
  }

  function handleLanguageChange(lang: string) {
    i18n.changeLanguage(lang);
    localStorage.setItem("skill-manager-lang", lang);
  }

  return {
    data: settingsQuery.data ?? null,
    errorMessage: errorMessage || (settingsQuery.error instanceof Error ? settingsQuery.error.message : ""),
    isPending: settingsQuery.isPending,
    isHarnessPending: (harness: string) => pendingRegistry.isPending(settingsSupportActionKey(harness)),
    setErrorMessage,
    handleSupportToggle,
    currentLanguage: i18n.language,
    handleLanguageChange,
  };
}
