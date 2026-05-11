import { Archive, Database, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ErrorBanner } from "../../../components/ErrorBanner";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { PageHeader } from "../../../components/PageHeader";
import { SettingsHarnessCard } from "../components/SettingsHarnessCard";
import { useSettingsPageController } from "../model/use-settings-page-controller";

export default function SettingsPage() {
  const { t } = useTranslation("settings");
  const controller = useSettingsPageController();

  return (
    <>
      <div className="page-chrome">
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
        />
      </div>

      {controller.errorMessage ? (
        <ErrorBanner message={controller.errorMessage} onDismiss={() => controller.setErrorMessage("")} />
      ) : null}

      {controller.isPending ? (
        <div className="panel-state">
          <LoadingSpinner label={t("loading")} />
        </div>
      ) : !controller.data ? (
        <div className="panel-state">
          <p className="muted-text">{t("errorTitle")}</p>
        </div>
      ) : (
        <>
          <section className="settings-section">
            <h2 className="settings-section__heading">{t("localStorage")}</h2>
            <div className="settings-row">
              <span className="settings-row__icon">
                <Database size={15} />
              </span>
              <div className="settings-row__body">
                <p className="settings-row__title">{t("skillManagerStore")}</p>
                <p className="settings-row__sub">{t("storeDescription")}</p>
              </div>
              <span className="settings-path">{controller.data.storePath}</span>
            </div>
            <div className="settings-row">
              <span className="settings-row__icon">
                <Archive size={15} />
              </span>
              <div className="settings-row__body">
                <p className="settings-row__title">{t("marketplaceCache")}</p>
                <p className="settings-row__sub">{t("marketplaceDescription")}</p>
              </div>
              <span className="settings-path">{controller.data.marketplacePath}</span>
            </div>
          </section>

          <section className="settings-section">
            <h2 className="settings-section__heading">{t("language")}</h2>
            <div className="settings-row">
              <span className="settings-row__icon">
                <Globe size={15} />
              </span>
              <div className="settings-row__body">
                <p className="settings-row__title">{t("languageLabel")}</p>
                <p className="settings-row__sub">{t("languageSub")}</p>
              </div>
              <select
                className="settings-lang-select"
                value={controller.currentLanguage}
                onChange={(e) => controller.handleLanguageChange(e.target.value)}
              >
                <option value="en">{t("langEn")}</option>
                <option value="zh-CN">{t("langZh")}</option>
              </select>
            </div>
          </section>

          <section className="settings-section">
            <h2 className="settings-section__heading">{t("harnessRoots")}</h2>
            {controller.data.harnesses.map((harness) => (
              <SettingsHarnessCard
                key={harness.harness}
                harness={harness}
                pending={controller.isHarnessPending(harness.harness)}
                onToggle={controller.handleSupportToggle}
              />
            ))}
          </section>
        </>
      )}
    </>
  );
}
