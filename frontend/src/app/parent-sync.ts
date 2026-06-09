import { useEffect } from "react";

import { LOCALE_STORAGE_KEY, type Locale } from "../i18n/locales";

interface ThemeChangeMessage {
  type: "THEME_CHANGE";
  theme: "light" | "dark";
}

interface LangChangeMessage {
  type: "LANG_CHANGE";
  // The host uses BCP-47 codes ("en-US", "zh-CN"). We treat any -CN variant
  // as Chinese and fall back to English otherwise.
  lang: string;
}

interface NavigateMessage {
  type: "NAVIGATE";
  to: string;
}

type ParentMessage = ThemeChangeMessage | LangChangeMessage | NavigateMessage;

function isParentMessage(data: unknown): data is ParentMessage {
  if (typeof data !== "object" || data === null) return false;
  const msg = data as Record<string, unknown>;
  if (msg.type === "THEME_CHANGE" && (msg.theme === "light" || msg.theme === "dark")) {
    return true;
  }
  if (msg.type === "LANG_CHANGE" && typeof msg.lang === "string") {
    return true;
  }
  if (msg.type === "NAVIGATE" && typeof msg.to === "string") {
    return true;
  }
  return false;
}

/**
 * Map the host's BCP-47 language tag onto 1skills' two-locale vocabulary.
 */
function toLocale(lang: string): Locale | null {
  if (lang.toLowerCase().startsWith("zh")) return "zh-CN";
  if (lang.toLowerCase().startsWith("en")) return "en";
  return null;
}

/**
 * Returns true when the page is loaded as a module slot inside the host
 * (1agents main app). In that case the host owns navigation, and we use
 * hash-based navigation since the iframe is served at /1skills/ while the
 * host sends bare paths like /skills/review.
 */
function isBareMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("bare") === "1";
}

export function useParentSync(): void {
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!isParentMessage(data)) return;

      if (data.type === "THEME_CHANGE") {
        document.documentElement.setAttribute("data-theme", data.theme);
        try {
          localStorage.setItem("1agents-theme", data.theme);
        } catch {
          // ignore
        }
        window.dispatchEvent(
          new CustomEvent("theme-sync", { detail: { theme: data.theme } }),
        );
      } else if (data.type === "LANG_CHANGE") {
        // Host pushed a language change. Persist it under the key the
        // LocaleProvider reads on mount, and notify any listeners.
        const next = toLocale(data.lang);
        if (next) {
          try {
            localStorage.setItem(LOCALE_STORAGE_KEY, next);
          } catch {
            // ignore
          }
          window.dispatchEvent(
            new CustomEvent("lang-sync", { detail: { locale: next } }),
          );
        }
      } else if (data.type === "NAVIGATE") {
        // Host asked us to navigate. In bare mode the router is HashRouter
        // (configured in main.tsx), so we update window.location.hash which
        // triggers React Router's hashchange listener. In standalone mode
        // we use BrowserRouter + pushState + popstate instead.
        const target = data.to.startsWith("/") ? data.to : "/" + data.to;
        if (isBareMode()) {
          const newHash = "#" + target;
          if (window.location.hash === newHash) return;
          try {
            window.location.hash = newHash;
          } catch {
            // ignore
          }
        } else {
          if (target === window.location.pathname) return;
          try {
            window.history.pushState({}, "", target);
            window.dispatchEvent(new PopStateEvent("popstate"));
          } catch {
            // ignore
          }
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);
}
