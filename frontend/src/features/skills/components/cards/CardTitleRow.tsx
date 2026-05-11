import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { CardSelectCheckbox } from "../../../../components/cards/CardSelectCheckbox";
import { OverflowTooltipText } from "../../../../components/ui/OverflowTooltipText";

interface CardTitleRowProps {
  name: string;
  checked: boolean;
  onToggleChecked: () => void;
  menu?: ReactNode;
}

export function CardTitleRow({
  name,
  checked,
  onToggleChecked,
  menu,
}: CardTitleRowProps) {
  const { t } = useTranslation("skills");

  return (
    <div className="skill-card__head">
      <OverflowTooltipText as="h3" className="skill-card__name">
        {name}
      </OverflowTooltipText>
      <span aria-hidden="true" />
      {menu ?? <span aria-hidden="true" />}
      <CardSelectCheckbox
        checked={checked}
        onToggle={onToggleChecked}
        label={checked ? t("card.deselectItem", { name }) : t("card.selectItem", { name })}
      />
    </div>
  );
}
