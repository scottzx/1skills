import { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  const { t } = useTranslation("common");

  useEffect(() => {
    if (!onDismiss) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="error-banner" role="alert">
      <span className="error-banner__message">{message}</span>
      {onDismiss && (
        <button type="button" className="error-banner__dismiss" onClick={onDismiss} aria-label={t("error.dismiss")}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
