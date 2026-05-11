import { useTranslation } from "react-i18next";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function LoadingSpinner({ size = "md", label }: LoadingSpinnerProps) {
  const { t } = useTranslation("common");
  return <span className={`spinner spinner-${size}`} role="status" aria-label={label ?? t("loading.generic")} />;
}
