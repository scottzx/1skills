import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "1agents-theme";

function getInitialTheme(): Theme {
  // Prefer the data-theme attribute set by the parent app
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") {
    return attr;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "dark";
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Listen for theme-sync events from parent-sync
  useEffect(() => {
    function handleThemeSync(e: Event) {
      const detail = (e as CustomEvent<{ theme: Theme }>).detail;
      if (detail?.theme && (detail.theme === "light" || detail.theme === "dark")) {
        setTheme(detail.theme);
        document.documentElement.setAttribute("data-theme", detail.theme);
        try {
          localStorage.setItem(STORAGE_KEY, detail.theme);
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener("theme-sync", handleThemeSync);
    return () => window.removeEventListener("theme-sync", handleThemeSync);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "dark",
      toggleTheme: () => {
        // no-op fallback
      },
    };
  }
  return ctx;
}
