import { useTranslation } from "react-i18next";
import { DetailSection } from "../../../../components/detail/DetailSection";

interface SlashCommandTextProps {
  description?: string | null;
  prompt?: string | null;
  descriptionEmptyText?: string;
  promptEmptyText?: string;
}

export function SlashCommandContentSections({
  description,
  prompt,
  descriptionEmptyText,
  promptEmptyText,
}: SlashCommandTextProps) {
  const { t } = useTranslation("slashCommands");
  return (
    <>
      <DetailSection heading={t("detail.description")}>
        <SlashCommandDescriptionBlock
          description={description}
          emptyText={descriptionEmptyText}
        />
      </DetailSection>
      <DetailSection heading={t("detail.prompt")}>
        <SlashCommandPromptPreview
          prompt={prompt}
          emptyText={promptEmptyText}
        />
      </DetailSection>
    </>
  );
}

export function SlashCommandSourcePreview({
  description,
  prompt,
  descriptionEmptyText,
  promptEmptyText,
}: SlashCommandTextProps) {
  const { t } = useTranslation("slashCommands");
  return (
    <div className="slash-command-detail__content-preview">
      <div className="slash-command-detail__content-field">
        <span>{t("detail.description")}</span>
        <SlashCommandDescriptionBlock
          description={description}
          emptyText={descriptionEmptyText}
        />
      </div>
      <div className="slash-command-detail__content-field">
        <span>{t("detail.prompt")}</span>
        <SlashCommandPromptPreview
          prompt={prompt}
          emptyText={promptEmptyText}
        />
      </div>
    </div>
  );
}

export function SlashCommandDescriptionBlock({
  description,
  emptyText,
}: {
  description?: string | null;
  emptyText?: string;
}) {
  const { t } = useTranslation("slashCommands");
  const defaultEmpty = t("detail.noDescription");
  return (
    <div className="slash-command-detail__description-block">
      <p className="slash-command-detail__description-text">
        {description?.trim() || emptyText || defaultEmpty}
      </p>
    </div>
  );
}

export function SlashCommandPromptPreview({
  prompt,
  emptyText,
}: {
  prompt?: string | null;
  emptyText?: string;
}) {
  const { t } = useTranslation("slashCommands");
  const defaultEmpty = t("detail.noPrompt");
  return (
    <pre className="slash-command-detail__prompt ui-scrollbar">
      {prompt?.trim() || emptyText || defaultEmpty}
    </pre>
  );
}
