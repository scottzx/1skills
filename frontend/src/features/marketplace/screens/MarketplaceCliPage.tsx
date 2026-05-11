import { useTranslation } from "react-i18next";

import { ErrorBanner } from "../../../components/ErrorBanner";
import { CliMarketplaceCard } from "../components/CliMarketplaceCard";
import { CliMarketplaceDetailSheet } from "../components/CliMarketplaceDetailSheet";
import { MarketplaceFeedPane } from "../components/MarketplaceFeedPane";
import { useCliMarketplaceController } from "../model/use-cli-marketplace-controller";

export interface MarketplaceCliPageProps {
  isActive: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onItemCountChange: (count: number) => void;
}

export default function MarketplaceCliPage({
  isActive,
  query,
  onQueryChange,
  onItemCountChange,
}: MarketplaceCliPageProps) {
  const { t } = useTranslation("marketplace");
  const {
    submittedQuery,
    items,
    feedQuery,
    status,
    errorMessage,
    hasMore,
    loadingMore,
    selectedId,
    selectedItem,
    openItem,
    closeItem,
  } = useCliMarketplaceController({ query, onQueryChange });
  const feedErrorMessage =
    feedQuery.error instanceof Error
      ? feedQuery.error.message
      : t("loading.cliError");

  const ownsItemId = Boolean(selectedId?.startsWith("clisdev:"));
  const resolvedItemId = isActive && ownsItemId ? selectedId : null;

  return (
    <>
      {errorMessage ? (
        <div className="page-chrome page-chrome--floating">
          <ErrorBanner message={errorMessage} />
        </div>
      ) : null}

      <MarketplaceFeedPane
        isActive={isActive}
        status={status}
        itemCount={items.length}
        hasMore={hasMore}
        loadingMore={loadingMore}
        loadingLabel={t("loading.cli")}
        errorMessage={feedErrorMessage}
        onItemCountChange={onItemCountChange}
        onLoadMore={() => feedQuery.fetchNextPage()}
        emptyState={
          <div className="panel-state">
            <p className="muted-text">
              {submittedQuery
                ? t("empty.cliSearch", { query: submittedQuery })
                : t("empty.cliEmpty")}
            </p>
          </div>
        }
      >
          <>
            <div className="market-grid">
              {items.map((item) => (
                <CliMarketplaceCard
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onOpenDetail={() => openItem(item.id)}
                />
              ))}
            </div>
          </>
      </MarketplaceFeedPane>

      <CliMarketplaceDetailSheet
        itemId={resolvedItemId}
        initialItem={selectedItem}
        onClose={closeItem}
      />
    </>
  );
}
