import { useEffect } from "react";

interface ThemeChangeMessage {
  type: "THEME_CHANGE";
  theme: "light" | "dark";
}

interface LangChangeMessage {
  type: "LANG_CHANGE";
  lang: "en-US" | "zh-CN";
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
  if (msg.type === "LANG_CHANGE" && (msg.lang === "en-US" || msg.lang === "zh-CN")) {
    return true;
  }
  if (msg.type === "NAVIGATE" && typeof msg.to === "string") {
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
      } else if (data.type === "NAVIGATE") {
        // Host asked us to navigate. Push the path and emit a popstate so
        // React Router re-matches the new URL. We use pushState (not
        // replaceState) so the user's iframe-internal back/forward still
        // works inside the iframe.
        const target = data.to.startsWith("/") ? data.to : "/" + data.to;
        if (target === window.location.pathname) return;
        try {
          window.history.pushState({}, "", target);
          window.dispatchEvent(new PopStateEvent("popstate"));
        } catch {
          // ignore
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);
}
