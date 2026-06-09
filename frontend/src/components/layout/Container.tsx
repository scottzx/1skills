import type { ReactNode } from "react";

type ContainerElement = "div" | "section" | "main" | "article" | "aside";

interface ContainerProps {
  children: ReactNode;
  /**
   * The element to render. Defaults to `div`. Choose `main` only when the
   * container is the document's main content region.
   */
  as?: ContainerElement;
  /** Optional extra class names to merge with `container-query`. */
  className?: string;
}

/**
 * Establishes a CSS container query context for descendants.
 *
 * Apply once on the page shell (e.g. inside `<main className="app-main">`).
 * Inside the container, write child responsive rules as
 * `@container page (max-width: 600px) { ... }` — these read the container's
 * own width, not the viewport, so they remain correct when 1skills is
 * embedded as an iframe slot whose width the host controls.
 */
export function Container({ children, as: As = "div", className }: ContainerProps) {
  const classes = ["container-query", className].filter(Boolean).join(" ");
  return <As className={classes}>{children}</As>;
}
