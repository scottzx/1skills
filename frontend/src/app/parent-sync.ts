import { useEffect } from "react";

interface ThemeChangeMessage {
  type: "THEME_CHANGE";
  theme: "light" | "dark";
}

interface LangChangeMessage {
  type: "LANG_CHANGE";
  lang: "en-US" | "zh-CN";
}

type ParentMessage = ThemeChangeMessage | LangChangeMessage;

function isParentMessage(data: unknown): data is ParentMessage {
  if (typeof data !== "object" || data === null) return false;
  const msg = data as Record<string, unknown>;
  if (msg.type === "THEME_CHANGE" && (msg.theme === "light" || msg.theme === "dark")) {
    return true;
  }
  if (msg.type === "LANG_CHANGE" && (msg.lang === "en-US" || msg.lang === "zh-CN")) {
    return true;
  }
  return false;
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
        try {
          localStorage.setItem("1agents-language", data.lang);
        } catch {
          // ignore
        }
        window.dispatchEvent(
          new CustomEvent("lang-sync", { detail: { lang: data.lang } }),
        );
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);
}
