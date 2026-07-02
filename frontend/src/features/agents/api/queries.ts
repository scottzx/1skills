import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ScopedReconciliationTracker } from "../../../lib/async/scoped-reconciliation";
import { queryPolicy } from "../../../lib/query";
import {
  deleteAgent,
  disableAgent,
  enableAgent,
  fetchAgentDetail,
  fetchAgentSourceStatus,
  fetchAgentsPage,
  manageAgent,
  unmanageAgent,
} from "./client";
import {
  getDetailCellState,
  getListCellState,
  patchAgentDetailToggle,
  patchAgentsListToggle,
  removeAgentFromList,
} from "./cache-patches";
import { invalidateAgentsQueries } from "./invalidation";
import { AGENTS_GC_TIME_MS, AGENTS_STALE_TIME_MS, agentsKeys } from "./keys";
import { mapAgentDetail, mapAgentsPage } from "./mappers";
import type { HarnessCellState } from "../model/types";
import type { AgentDetailDto, AgentsPageDto } from "./types";

export { invalidateAgentsQueries } from "./invalidation";
export { agentsKeys } from "./keys";

export function useAgentsListQuery() {
  return useQuery({
    queryKey: agentsKeys.list(),
    queryFn: fetchAgentsPage,
    select: mapAgentsPage,
    ...queryPolicy(AGENTS_STALE_TIME_MS, AGENTS_GC_TIME_MS),
  });
}

export function useAgentDetailQuery(agentRef: string | null) {
  return useQuery({
    queryKey: agentsKeys.detail(agentRef ?? "__none__"),
    queryFn: () => fetchAgentDetail(agentRef!),
    select: mapAgentDetail,
    enabled: Boolean(agentRef),
    ...queryPolicy(AGENTS_STALE_TIME_MS, AGENTS_GC_TIME_MS),
  });
}

export function useAgentSourceStatusQuery(agentRef: string | null) {
  return useQuery({
    queryKey: agentsKeys.sourceStatus(agentRef ?? "__none__"),
    queryFn: () => fetchAgentSourceStatus(agentRef!),
    enabled: Boolean(agentRef),
    ...queryPolicy(AGENTS_STALE_TIME_MS, AGENTS_GC_TIME_MS),
  });
}

export function useToggleAgentMutation() {
  const queryClient = useQueryClient();
  const reconciliationRef = useRef<ScopedReconciliationTracker<string> | null>(null);

  if (reconciliationRef.current === null) {
    reconciliationRef.current = new ScopedReconciliationTracker<string>();
  }

  return useMutation({
    mutationFn: async ({
      agentRef,
      harness,
      nextState,
    }: {
      agentRef: string;
      harness: string;
      nextState: HarnessCellState;
    }) => {
      if (nextState === "enabled") {
        return enableAgent(agentRef, harness);
      }
      return disableAgent(agentRef, harness);
    },
    onMutate: async ({ agentRef, harness, nextState }) => {
      reconciliationRef.current?.begin(agentRef);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: agentsKeys.list() }),
        queryClient.cancelQueries({ queryKey: agentsKeys.detail(agentRef) }),
      ]);

      const previousList = queryClient.getQueryData<AgentsPageDto>(agentsKeys.list());
      const previousDetail = queryClient.getQueryData<AgentDetailDto>(agentsKeys.detail(agentRef));
      const previousListCellState = getListCellState(previousList, agentRef, harness);
      const previousDetailCellState = getDetailCellState(previousDetail, harness);

      if (previousList) {
        queryClient.setQueryData<AgentsPageDto>(
          agentsKeys.list(),
          patchAgentsListToggle(previousList, agentRef, harness, nextState),
        );
      }
      if (previousDetail) {
        queryClient.setQueryData<AgentDetailDto>(
          agentsKeys.detail(agentRef),
          patchAgentDetailToggle(previousDetail, harness, nextState),
        );
      }

      return {
        agentRef,
        harness,
        previousListCellState,
        previousDetailCellState,
      };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      if (context.previousListCellState !== null) {
        const previousListCellState = context.previousListCellState;
        queryClient.setQueryData<AgentsPageDto>(
          agentsKeys.list(),
          (current) => current ? patchAgentsListToggle(
            current,
            context.agentRef,
            context.harness,
            previousListCellState,
          ) : current,
        );
      }
      if (context.previousDetailCellState !== null) {
        const previousDetailCellState = context.previousDetailCellState;
        queryClient.setQueryData<AgentDetailDto>(
          agentsKeys.detail(context.agentRef),
          (current) => current ? patchAgentDetailToggle(
            current,
            context.harness,
            previousDetailCellState,
          ) : current,
        );
      }
    },
    onSettled: async (_data, _error, variables) => {
      const decision = reconciliationRef.current?.finish(variables.agentRef) ?? {
        invalidateAll: true,
        invalidateScope: true,
      };
      const invalidations: Promise<unknown>[] = [];

      if (decision.invalidateScope) {
        invalidations.push(queryClient.invalidateQueries({ queryKey: agentsKeys.detail(variables.agentRef) }));
        invalidations.push(queryClient.invalidateQueries({ queryKey: agentsKeys.sourceStatus(variables.agentRef) }));
      }

      if (decision.invalidateAll) {
        invalidations.push(queryClient.invalidateQueries({ queryKey: agentsKeys.list() }));
      }

      if (invalidations.length > 0) {
        await Promise.all(invalidations);
      }
    },
  });
}

export function useManageAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentRef }: { agentRef: string }) => manageAgent(agentRef),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: agentsKeys.list() }),
        queryClient.invalidateQueries({ queryKey: agentsKeys.detail(variables.agentRef) }),
        queryClient.invalidateQueries({ queryKey: agentsKeys.sourceStatus(variables.agentRef) }),
      ]);
    },
  });
}

export function useUnmanageAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentRef }: { agentRef: string }) => unmanageAgent(agentRef),
    onSuccess: async (_data, variables) => {
      queryClient.removeQueries({ queryKey: agentsKeys.detail(variables.agentRef), exact: true });
      queryClient.removeQueries({ queryKey: agentsKeys.sourceStatus(variables.agentRef), exact: true });
      await invalidateAgentsQueries(queryClient);
    },
  });
}

export function useDeleteAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentRef }: { agentRef: string }) => deleteAgent(agentRef),
    onMutate: async ({ agentRef }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: agentsKeys.list() }),
        queryClient.cancelQueries({ queryKey: agentsKeys.detail(agentRef) }),
        queryClient.cancelQueries({ queryKey: agentsKeys.sourceStatus(agentRef) }),
      ]);

      const previousList = queryClient.getQueryData<AgentsPageDto>(agentsKeys.list());
      const previousDetail = queryClient.getQueryData(agentsKeys.detail(agentRef));

      if (previousList) {
        queryClient.setQueryData<AgentsPageDto>(agentsKeys.list(), removeAgentFromList(previousList, agentRef));
      }
      queryClient.removeQueries({ queryKey: agentsKeys.detail(agentRef), exact: true });
      queryClient.removeQueries({ queryKey: agentsKeys.sourceStatus(agentRef), exact: true });

      return { previousList, previousDetail, agentRef };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(agentsKeys.list(), context.previousList);
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(agentsKeys.detail(context.agentRef), context.previousDetail);
      }
    },
    onSuccess: async (_data, variables) => {
      queryClient.removeQueries({ queryKey: agentsKeys.detail(variables.agentRef), exact: true });
      queryClient.removeQueries({ queryKey: agentsKeys.sourceStatus(variables.agentRef), exact: true });
      await invalidateAgentsQueries(queryClient);
    },
  });
}
