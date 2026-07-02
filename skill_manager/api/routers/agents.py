from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from skill_manager.application import BackendContainer
from skill_manager.api.deps import get_container
from skill_manager.api.schemas import (
    AgentDetailResponse,
    AgentSourceStatusResponse,
    AgentStatusFromPathRequest,
    AgentStatusResultResponse,
    AgentsPageResponse,
    DisableAgentRequest,
    EnableAgentRequest,
    OkResponse,
    PushAgentFromPathRequest,
    PushAgentResultResponse,
)

router = APIRouter(prefix="/api/agents")


@router.get("", response_model=AgentsPageResponse)
def list_agents(container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    return container.agents_queries.list_agents()


@router.get("/{agent_ref:path}/source-status", response_model=AgentSourceStatusResponse)
def get_agent_source_status(agent_ref: str, container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    payload = container.agents_queries.get_agent_source_status(agent_ref)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"unknown agent ref: {agent_ref}")
    return payload


@router.get("/{agent_ref:path}", response_model=AgentDetailResponse)
def get_agent_detail(agent_ref: str, container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    payload = container.agents_queries.get_agent_detail(agent_ref)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"unknown agent ref: {agent_ref}")
    return payload


@router.post("/{agent_ref:path}/enable", response_model=OkResponse)
def enable_agent(
    agent_ref: str,
    body: EnableAgentRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, bool]:
    return container.agents_mutations.enable_agent(agent_ref, body.harness)


@router.post("/{agent_ref:path}/disable", response_model=OkResponse)
def disable_agent(
    agent_ref: str,
    body: DisableAgentRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, bool]:
    return container.agents_mutations.disable_agent(agent_ref, body.harness)


@router.post("/{agent_ref:path}/manage", response_model=OkResponse)
def manage_agent(agent_ref: str, container: BackendContainer = Depends(get_container)) -> dict[str, bool]:
    return container.agents_mutations.manage_agent(agent_ref)


@router.post("/{agent_ref:path}/status-from-path", response_model=AgentStatusResultResponse)
def agent_status_from_path(
    agent_ref: str,
    body: AgentStatusFromPathRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, object]:
    return container.agents_queries.agent_status_from_path(agent_ref, body.source_path)


@router.post("/{agent_ref:path}/push-from-path", response_model=PushAgentResultResponse)
def push_agent_from_path(
    agent_ref: str,
    body: PushAgentFromPathRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, object]:
    return container.agents_mutations.push_agent_from_path(agent_ref, body.source_path)


@router.post("/{agent_ref:path}/unmanage", response_model=OkResponse)
def unmanage_agent(agent_ref: str, container: BackendContainer = Depends(get_container)) -> dict[str, bool]:
    return container.agents_mutations.unmanage_agent(agent_ref)


@router.post("/{agent_ref:path}/delete", response_model=OkResponse)
def delete_agent(agent_ref: str, container: BackendContainer = Depends(get_container)) -> dict[str, bool]:
    return container.agents_mutations.delete_agent(agent_ref)
