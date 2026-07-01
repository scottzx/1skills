import { type ReactNode, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Check,
  ChevronDown,
  Languages,
  Moon,
  RefreshCw,
  Settings,
  SunMedium,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { useSidebarModel, type SidebarLinkModel } from "../app/capability-registry";
import { LoadingSpinner } from "./LoadingSpinner";
import { useBareMode } from "../lib/bare-mode";
import { useCommonCopy, useLocale } from "../i18n";
import { useTheme } from "../app/theme";
import { usePortalContainer } from "../lib/portal-container";

interface TopNavProps {
  onRefresh: () => void | Promise<void>;
  refreshPending: boolean;
}

interface TopTab {
  key: string;
  label: string;
  /** Where clicking the top tab navigates (first sub-link, or the tab itself). */
  to: string;
  /** Second-level links revealed on hover; empty for single-page tabs. */
  links: SidebarLinkModel[];
}

/** Active if the pathname is the link target or nested beneath it. */
function isLinkActive(to: string, pathname: string): boolean {
  return pathname === to || pathname.startsWith(to + "/");
}

/** Pick the most specific (longest `to`) matching link — handles /marketplace
 *  being a prefix of /marketplace/mcp. */
function activeLink(links: SidebarLinkModel[], pathname: string): SidebarLinkModel | null {
  let best: SidebarLinkModel | null = null;
  for (const link of links) {
    if (isLinkActive(link.to, pathname) && (!best || link.to.length > best.to.length)) {
      best = link;
    }
  }
  return best;
}

/**
 * Top navigation — a compact breadcrumb + underline tab row. Second-level
 * navigation is deliberately hidden until you hover (or focus) a tab, then it
 * floats down as a dropdown — keeping the chrome minimal. The breadcrumb keeps
 * the full path (root › section › sub-section) so the current location stays
 * visible without the sub-nav taking permanent space. Mirrors the 1agents host
 * project-page language; used in both standalone and embedded (bare) modes.
 */
export function TopNav({ onRefresh, refreshPending }: TopNavProps) {
  const model = useSidebarModel();
  const common = useCommonCopy();
  const bare = useBareMode();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const pathname = location.pathname;

  // Which tab's flyout is currently open (hover / keyboard focus).
  const [openKey, setOpenKey] = useState<string | null>(null);

  const tabs: TopTab[] = [
    ...model.topLinks.map((link) => ({ key: link.key, label: link.label, to: link.to, links: [] })),
    ...model.groups.map((group) => ({
      key: group.key,
      label: group.label,
      to: group.links[0]?.to ?? "/overview",
      links: group.links,
    })),
  ];

  const activeTab =
    tabs.find((tab) =>
      tab.links.length ? tab.links.some((link) => isLinkActive(link.to, pathname)) : isLinkActive(tab.to, pathname),
    ) ?? null;

  const settingsActive = isLinkActive("/settings", pathname);
  const activeSub = activeTab ? activeLink(activeTab.links, pathname) : null;

  return (
    <header className="skills-topnav">
      <div className="skills-topnav__bar">
        <nav className="skills-topnav__tabs" aria-label={common.nav.primary}>
          {tabs.map((tab) => {
            const tabActive = activeTab?.key === tab.key;
            const hasFlyout = tab.links.length > 0;
            const open = openKey === tab.key;
            const currentSub = tabActive ? activeSub : null;
            return (
              <div
                key={tab.key}
                className="skills-topnav__tab-item"
                onMouseEnter={hasFlyout ? () => setOpenKey(tab.key) : undefined}
                onMouseLeave={hasFlyout ? () => setOpenKey((k) => (k === tab.key ? null : k)) : undefined}
                onFocus={hasFlyout ? () => setOpenKey(tab.key) : undefined}
                onBlur={
                  hasFlyout
                    ? (event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setOpenKey((k) => (k === tab.key ? null : k));
                        }
                      }
                    : undefined
                }
              >
                <Link
                  to={tab.to}
                  className={`skills-topnav__tab${tabActive ? " is-active" : ""}`}
                  aria-current={tabActive ? "page" : undefined}
                  aria-haspopup={hasFlyout ? "menu" : undefined}
                  aria-expanded={hasFlyout ? open : undefined}
                >
                  {tab.label}
                  {hasFlyout ? (
                    <ChevronDown className="skills-topnav__tab-caret" size={13} aria-hidden="true" />
                  ) : null}
                </Link>
                {hasFlyout && open ? (
                  <div className="skills-topnav__flyout">
                    <div className="skills-topnav__flyout-card" role="menu" aria-label={tab.label}>
                      {tab.links.map((link) => {
                        const linkActive = currentSub?.key === link.key;
                        return (
                          <Link
                            key={link.key}
                            to={link.to}
                            role="menuitem"
                            className={`skills-topnav__flyout-link${linkActive ? " is-active" : ""}`}
                            aria-current={linkActive ? "page" : undefined}
                            onClick={() => setOpenKey(null)}
                          >
                            <span>{link.label}</span>
                            {link.count != null ? (
                              <span className="skills-topnav__flyout-count">{link.count}</span>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="skills-topnav__actions">
          <button
            type="button"
            className="skills-topnav__action"
            onClick={() => void onRefresh()}
            disabled={refreshPending}
            aria-busy={refreshPending}
            title={common.actions.refresh}
            aria-label={common.actions.refresh}
          >
            {refreshPending ? (
              <LoadingSpinner size="sm" label={common.actions.refreshing} />
            ) : (
              <RefreshCw size={16} />
            )}
          </button>
          {/* Standalone owns theme + language; in bare mode the host controls them. */}
          {!bare ? (
            <>
              <button
                type="button"
                className="skills-topnav__action"
                onClick={toggleTheme}
                title={theme === "dark" ? common.nav.light : common.nav.dark}
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              >
                {theme === "dark" ? <SunMedium size={16} /> : <Moon size={16} />}
              </button>
              <TopNavLanguageMenu />
            </>
          ) : null}
          <Link
            to="/settings"
            className={`skills-topnav__action${settingsActive ? " is-active" : ""}`}
            aria-current={settingsActive ? "page" : undefined}
            title={common.nav.settings}
            aria-label={common.nav.settings}
          >
            <Settings size={16} />
          </Link>
        </div>
      </div>
    </header>
  );
}

function TopNavLanguageMenu(): ReactNode {
  const common = useCommonCopy();
  const { locale, setLocale, supportedLocales } = useLocale();
  const activeLabel = supportedLocales.find((option) => option.value === locale)?.nativeLabel ?? locale;
  const portalContainer = usePortalContainer();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="skills-topnav__action skills-topnav__action--wide"
          aria-label={common.language.ariaLabel(activeLabel)}
          aria-haspopup="menu"
        >
          <Languages size={16} />
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal container={portalContainer || undefined}>
        <Popover.Content className="ui-popup ui-popup--menu ui-menu" side="bottom" align="end" sideOffset={8}>
          <ul className="ui-menu__list" role="menu" aria-label={common.language.label}>
            {supportedLocales.map((option) => {
              const selected = option.value === locale;
              return (
                <li key={option.value}>
                  <Popover.Close asChild>
                    <button
                      type="button"
                      className="ui-menu__item"
                      data-selected={selected || undefined}
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => setLocale(option.value)}
                    >
                      <span className="ui-menu__icon" aria-hidden="true">
                        {selected ? <Check size={14} /> : null}
                      </span>
                      <span className="ui-menu__label">{option.nativeLabel}</span>
                      <span className="ui-menu__meta">{selected ? common.language.selected : option.label}</span>
                    </button>
                  </Popover.Close>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
