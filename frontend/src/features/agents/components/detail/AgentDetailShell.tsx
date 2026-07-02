import type { ReactNode } from "react";

interface AgentDetailShellProps {
  chrome: ReactNode;
  body: ReactNode;
  footer?: ReactNode;
  bodyAriaLabelledBy?: string;
  bodyAriaHidden?: boolean;
}

export function AgentDetailShell({
  chrome,
  body,
  footer,
  bodyAriaLabelledBy,
  bodyAriaHidden = false,
}: AgentDetailShellProps) {
  return (
    <>
      <div className="skill-detail-shell__chrome">{chrome}</div>
      <div
        className="skill-detail-shell__body ui-scrollbar"
        aria-labelledby={bodyAriaHidden ? undefined : bodyAriaLabelledBy}
        aria-hidden={bodyAriaHidden || undefined}
      >
        <div className="detail-sheet__body">{body}</div>
      </div>
      {footer ? (
        <footer className="skill-detail-shell__footer" aria-label="Agent actions">
          {footer}
        </footer>
      ) : null}
    </>
  );
}
