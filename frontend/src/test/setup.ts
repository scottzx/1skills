import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

import i18n from "../i18n/config";
import { installMockLocalStorage } from "./local-storage";

try {
  if (typeof window.localStorage.clear !== "function") {
    installMockLocalStorage();
  }
} catch {
  installMockLocalStorage();
}

if (typeof ResizeObserver === "undefined") {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserver);
}

beforeEach(() => {
  i18n.changeLanguage("en");
});
