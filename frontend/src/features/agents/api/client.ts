import type {
  AgentDetailDto,
  AgentsPageDto,
  AgentSourceStatusDto,
  DisableAgentRequest,
  EnableAgentRequest,
  OkResponse,
} from "./types";
import { fetchJson, postJson } from "../../../api/http";

export async function fetchAgentsPage(): Promise<AgentsPageDto> {
  return fetchJson<AgentsPageDto>("/agents");
}

export async function fetchAgentDetail(agentRef: string): Promise<AgentDetailDto> {
  return fetchJson<AgentDetailDto>(`/agents/${encodeURIComponent(agentRef)}`);
}

export async function fetchAgentSourceStatus(agentRef: string): Promise<AgentSourceStatusDto> {
  return fetchJson<AgentSourceStatusDto>(`/agents/${encodeURIComponent(agentRef)}/source-status`);
}

export async function enableAgent(agentRef: string, harness: string): Promise<OkResponse> {
  const body: EnableAgentRequest = { harness };
  return postJson<OkResponse>(`/agents/${encodeURIComponent(agentRef)}/enable`, body);
}

export async function disableAgent(agentRef: string, harness: string): Promise<OkResponse> {
  const body: DisableAgentRequest = { harness };
  return postJson<OkResponse>(`/agents/${encodeURIComponent(agentRef)}/disable`, body);
}

export async function manageAgent(agentRef: string): Promise<OkResponse> {
  return postJson<OkResponse>(`/agents/${encodeURIComponent(agentRef)}/manage`);
}

export async function unmanageAgent(agentRef: string): Promise<OkResponse> {
  return postJson<OkResponse>(`/agents/${encodeURIComponent(agentRef)}/unmanage`);
}

export async function deleteAgent(agentRef: string): Promise<OkResponse> {
  return postJson<OkResponse>(`/agents/${encodeURIComponent(agentRef)}/delete`);
}
