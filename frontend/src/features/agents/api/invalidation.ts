import type { QueryClient } from "@tanstack/react-query";

import { agentsKeys } from "./keys";

export async function invalidateAgentsQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: agentsKeys.list() }),
    queryClient.invalidateQueries({ queryKey: agentsKeys.detailPrefix() }),
    queryClient.invalidateQueries({ queryKey: agentsKeys.sourceStatusPrefix() }),
  ]);
}
