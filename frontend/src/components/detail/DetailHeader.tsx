import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { DetailCloseButton } from "./DetailCloseButton";

interface DetailHeaderProps {
  title: ReactNode;
  onClose: () => void;
  titleAction?: ReactNode;
  meta?: ReactNode;
  utility?: ReactNode;
  closeLabel?: string;
}

export function DetailHeader({
  title,
  onClose,
  titleAction,
  meta,
  utility,
  closeLabel,
}: DetailHeaderProps) {
  const { t } = useTranslation("common");
  return (
    <div className="skill-detail__header">
      <div className="skill-detail__header-top">
        <div className="skill-detail__utility-rail">
          {utility ? <div className="skill-detail__utility-content">{utility}</div> : null}
          <DetailCloseButton onClick={onClose} ariaLabel={closeLabel ?? t("detail.close")} />
        </div>
      </div>
      <div className="skill-detail__title-stack">
        <div className="skill-detail__title-row">
          <div className="skill-detail__title-copy">{title}</div>
          {titleAction ? <div className="skill-detail__title-action">{titleAction}</div> : null}
        </div>
        {meta ? <div className="skill-detail__meta-row">{meta}</div> : null}
      </div>
    </div>
  );
}
