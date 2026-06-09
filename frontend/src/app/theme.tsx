import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

export const DEFAULT_THEME: Theme = "dark";
export const THEME_STORAGE_KEY = "1agents-theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* noop - storage may be unavailable */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === "undefined" ? DEFAULT_THEME : readStoredTheme(),
  );

  // Apply theme to document element
  useEffect(() => {
    if (!globalThis.__SKILLS_EMBED_MODE__) {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  // Listen for sync events from parent container
  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleThemeSync(event: Event) {
      const customEvent = event as CustomEvent<{ theme: Theme }>;
      if (customEvent.detail && isTheme(customEvent.detail.theme)) {
        setThemeState(customEvent.detail.theme);
      }
    }

    window.addEventListener("theme-sync", handleThemeSync);
    return () => window.removeEventListener("theme-sync", handleThemeSync);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writeStoredTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context) {
    return context;
  }
  return {
    theme: DEFAULT_THEME,
    setTheme: () => undefined,
    toggleTheme: () => undefined,
  };
}
