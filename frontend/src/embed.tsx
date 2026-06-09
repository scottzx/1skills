/**
 * Embed entry for 1agents host integration.
 *
 * Loaded as `<script type="module" src=".../skills-embed.js">` by the host.
 * Defines a `<skills-panel>` custom element that mounts the regular
 * 1skills React tree inside a `MemoryRouter` (NOT a BrowserRouter — we
 * must not pollute the host's window.history). The host owns the
 * external URL; the React tree keeps its own memory history.
 *
 * Communication contract with the host:
 *
 *   host → element   attribute: theme, lang, route
 *   element → host   CustomEvent('navigate', { detail: { path } })
 *
 * Internally:
 *  - theme / lang attribute changes dispatch the same `theme-sync` /
 *    `lang-sync` CustomEvents the iframe bare mode already listens to,
 *    so existing `ThemeProvider` and `LocaleProvider` work untouched.
 *  - `route` attribute changes dispatch a `skills-embed-route` event on
 *    the element. An internal bridge component (`EmbedBridge`) catches
 *    it and calls `useNavigate`, since the custom element itself lives
 *    outside the React tree and cannot call hooks directly.
 *  - The reverse direction (react-router → host) flows through the
 *    existing `useNavReporter` hook, which is gated on the
 *    `__SKILLS_EMBED_MODE__` flag we set here before mounting.
 */

import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import { App } from "./App";
import { isTheme, type Theme } from "./app/theme";
import type { Locale } from "./i18n/locales";
import embedCss from "./embed.css?inline";
import { PortalContainerContext } from "./lib/portal-container";

declare global {
  // Set in connectedCallback so useBareMode() / useNavReporter() can
  // detect embed mode at runtime.
  // eslint-disable-next-line no-var
  var __SKILLS_EMBED_MODE__: boolean | undefined;
}

function toLocale(lang: string): Locale | null {
  const lower = lang.toLowerCase();
  if (lower.startsWith("zh")) return "zh-CN";
  if (lower.startsWith("en")) return "en";
  return null;
}

function normalizeRoute(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

/**
 * Bridge component living inside the MemoryRouter.
 *
 * Owns the host → react-router direction (the custom element cannot
 * call useNavigate directly, so we listen for an event on the element
 * and forward to the router). The react-router → host direction is
 * handled by useNavReporter, which is already wired to the
 * __SKILLS_EMBED_MODE__ flag.
 */
function EmbedBridge({ target }: { target: HTMLElement }) {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string }>).detail;
      if (!detail?.path) return;
      navigate(detail.path);
    };
    target.addEventListener("skills-embed-route", handler);
    return () => target.removeEventListener("skills-embed-route", handler);
  }, [target, navigate]);

  return null;
}

class SkillsPanelElement extends HTMLElement {
  static observedAttributes = ["theme", "lang", "route"] as const;

  private root: Root | undefined;
  private mounted = false;
  private navHandler = (event: Event) => {
    const detail = (event as CustomEvent<{ path: string }>).detail;
    if (!detail?.path) return;
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { path: detail.path },
        bubbles: true,
        composed: true,
      }),
    );
  };

  connectedCallback(): void {
    if (this.mounted) return;
    this.mounted = true;

    const shadowRoot = this.attachShadow({ mode: "open" });

    // Inject CSS into shadow root
    const style = document.createElement("style");
    style.textContent = embedCss;
    shadowRoot.appendChild(style);

    // Create container for React
    const rootContainer = document.createElement("div");
    rootContainer.className = "skills-panel-root-container";
    rootContainer.style.width = "100%";
    rootContainer.style.height = "100%";
    shadowRoot.appendChild(rootContainer);

    // Create container for portals inside shadow root
    const portalContainer = document.createElement("div");
    portalContainer.className = "skills-panel-portals";
    shadowRoot.appendChild(portalContainer);

    // Flip the embed flag so existing useBareMode / useNavReporter
    // hooks take the embed branch (see bare-mode.ts / nav-reporter.ts).
    globalThis.__SKILLS_EMBED_MODE__ = true;

    const initialPath = this.getAttribute("route")
      ? normalizeRoute(this.getAttribute("route") as string)
      : "/overview";

    this.root = createRoot(rootContainer);
    this.root.render(
      <PortalContainerContext.Provider value={portalContainer}>
        <MemoryRouter initialEntries={[initialPath]}>
          <App />
          <EmbedBridge target={this} />
        </MemoryRouter>
      </PortalContainerContext.Provider>,
    );

    // Replay any attributes the host set before mount completed.
    queueMicrotask(() => this.applyAttributes());

    window.addEventListener("skills-navigate", this.navHandler);
  }

  disconnectedCallback(): void {
    window.removeEventListener("skills-navigate", this.navHandler);
    this.root?.unmount();
    this.root = undefined;
    this.mounted = false;
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (oldValue === newValue) return;
    if (!this.mounted) return; // connectedCallback replays via applyAttributes
    this.applyAttribute(name, newValue);
  }

  private applyAttributes(): void {
    this.applyAttribute("theme", this.getAttribute("theme"));
    this.applyAttribute("lang", this.getAttribute("lang"));
    this.applyAttribute("route", this.getAttribute("route"));
  }

  private applyAttribute(name: string, value: string | null): void {
    if (value == null || value === "") return;
    if (name === "theme" && isTheme(value)) {
      window.dispatchEvent(
        new CustomEvent("theme-sync", { detail: { theme: value as Theme } }),
      );
    } else if (name === "lang") {
      const locale = toLocale(value);
      if (locale) {
        window.dispatchEvent(
          new CustomEvent("lang-sync", { detail: { locale } }),
        );
      }
    } else if (name === "route") {
      this.dispatchEvent(
        new CustomEvent("skills-embed-route", {
          detail: { path: normalizeRoute(value) },
        }),
      );
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("skills-panel")) {
  customElements.define("skills-panel", SkillsPanelElement);
}
