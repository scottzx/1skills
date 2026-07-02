export const AGENTS_STALE_TIME_MS = 60_000;
export const AGENTS_GC_TIME_MS = 15 * 60_000;

export const agentsKeys = {
  all: ["agents"] as const,
  list: () => ["agents", "list"] as const,
  detailPrefix: () => ["agents", "detail"] as const,
  detail: (agentRef: string) => ["agents", "detail", agentRef] as const,
  sourceStatusPrefix: () => ["agents", "source-status"] as const,
  sourceStatus: (agentRef: string) => ["agents", "source-status", agentRef] as const,
};
