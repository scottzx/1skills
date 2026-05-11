import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "../locales/en/common.json";
import enSkills from "../locales/en/skills.json";
import enMcp from "../locales/en/mcp.json";
import enMarketplace from "../locales/en/marketplace.json";
import enSlashCommands from "../locales/en/slashCommands.json";
import enSettings from "../locales/en/settings.json";
import enOverview from "../locales/en/overview.json";

import zhCommon from "../locales/zh-CN/common.json";
import zhSkills from "../locales/zh-CN/skills.json";
import zhMcp from "../locales/zh-CN/mcp.json";
import zhMarketplace from "../locales/zh-CN/marketplace.json";
import zhSlashCommands from "../locales/zh-CN/slashCommands.json";
import zhSettings from "../locales/zh-CN/settings.json";
import zhOverview from "../locales/zh-CN/overview.json";

const resources = {
  en: {
    common: enCommon,
    skills: enSkills,
    mcp: enMcp,
    marketplace: enMarketplace,
    slashCommands: enSlashCommands,
    settings: enSettings,
    overview: enOverview,
  },
  "zh-CN": {
    common: zhCommon,
    skills: zhSkills,
    mcp: zhMcp,
    marketplace: zhMarketplace,
    slashCommands: zhSlashCommands,
    settings: zhSettings,
    overview: zhOverview,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: "zh-CN",
    fallbackLng: "zh-CN",
    defaultNS: "common",
    interpolation: { escapeValue: false },
    returnObjects: true,
    react: { useSuspense: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "skill-manager-lang",
      caches: ["localStorage"],
    },
    initImmediate: false,
  });

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

document.documentElement.lang = i18n.language;

export default i18n;