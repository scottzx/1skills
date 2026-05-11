import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";

import { ToastProvider } from "../components/Toast";
import { UiTooltipProvider } from "../components/ui/UiTooltipProvider";
import i18n from "../i18n/config";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export function renderWithAppProviders(
  ui: ReactElement,
  {
    route = "/",
    queryClient = createTestQueryClient(),
    ...renderOptions
  }: RenderOptions & {
    route?: string;
    queryClient?: QueryClient;
  } = {},
) {
  const result = render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <UiTooltipProvider delayDuration={0} skipDelayDuration={0}>
            <ToastProvider>
              <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
            </ToastProvider>
          </UiTooltipProvider>
        </QueryClientProvider>
      </I18nextProvider>
    ),
    ...renderOptions,
  });

  return { ...result, queryClient };
}

export function renderWithRouter(
  ui: ReactElement,
  {
    route = "/",
    ...renderOptions
  }: RenderOptions & {
    route?: string;
  } = {},
) {
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    ),
    ...renderOptions,
  });
}

export function stubDesktopMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
