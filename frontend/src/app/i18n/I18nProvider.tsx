import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { dictionaries, type Lang } from "./translations";

const STORAGE_KEY = "1agents-language";

function getInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en-US" || stored === "zh-CN") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "zh-CN";
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = params[key];
    return value != null ? String(value) : `{{${key}}}`;
  });
}

interface I18nContextValue {
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = dictionaries[lang];
      if (dict[key] != null) {
        return interpolate(dict[key], params);
      }
      // Fallback to en-US
      const enDict = dictionaries["en-US"];
      if (enDict[key] != null) {
        return interpolate(enDict[key], params);
      }
      // Final fallback to key itself
      if (params) {
        return interpolate(key, params);
      }
      return key;
    },
    [lang],
  );

  const setLang = useCallback((nextLang: Lang) => {
    setLangState(nextLang);
    try {
      localStorage.setItem(STORAGE_KEY, nextLang);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Listen for lang-sync events from parent-sync
  useEffect(() => {
    function handleLangSync(e: Event) {
      const detail = (e as CustomEvent<{ lang: Lang }>).detail;
      if (detail?.lang && (detail.lang === "en-US" || detail.lang === "zh-CN")) {
        setLangState(detail.lang);
        try {
          localStorage.setItem(STORAGE_KEY, detail.lang);
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener("lang-sync", handleLangSync);
    return () => window.removeEventListener("lang-sync", handleLangSync);
  }, []);

  const value = useMemo<I18nContextValue>(() => ({ lang, t, setLang }), [lang, t, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Graceful fallback when no provider: return a no-op that echoes keys
    return {
      lang: "en-US",
      t: (key: string, params?: Record<string, string | number>) => {
        if (params) {
          return interpolate(key, params);
        }
        return key;
      },
      setLang: () => {
        // no-op
      },
    };
  }
  return ctx;
}
