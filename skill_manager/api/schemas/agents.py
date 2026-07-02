from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .common import HarnessTarget


class EnableAgentRequest(HarnessTarget):
    pass


class DisableAgentRequest(HarnessTarget):
    pass


class PushAgentFromPathRequest(BaseModel):
    """Overwrite a managed shared-store agent with a locally-modified copy.

    The reverse of the create-time weak-copy: a workspace edited its own
    ``<name>.md`` copy at ``sourcePath`` (e.g. ``<workspace>/.claude/agents/<name>.md``)
    and now pushes it back to become the shared store's new baseline.
    """

    model_config = ConfigDict(populate_by_name=True)

    source_path: str = Field(
        ...,
        alias="sourcePath",
        min_length=1,
        description="Absolute path to the modified agent .md file",
    )


class PushAgentResultResponse(BaseModel):
    ok: bool
    changed: bool = Field(
        ...,
        description="True when the store baseline was written; False when the copy was identical",
    )
    created: bool = Field(
        False,
        description="True when a custom agent was ingested into the store for the first time",
    )


class AgentStatusFromPathRequest(BaseModel):
    """Read-only counterpart to PushAgentFromPathRequest — report a workspace
    copy's status against the store baseline without mutating it."""

    model_config = ConfigDict(populate_by_name=True)

    source_path: str = Field(
        ...,
        alias="sourcePath",
        min_length=1,
        description="Absolute path to the workspace's agent .md file",
    )


class AgentStatusResultResponse(BaseModel):
    inStore: bool = Field(..., description="True when the store (母体) already has this agent")
    differs: bool = Field(..., description="True when the workspace copy differs from the store baseline")
    exists: bool = Field(..., description="False when no agent file was found at the given path")
    name: str = Field("", description="Declared name from the workspace copy's frontmatter")
    description: str = Field("", description="Description from the workspace copy's frontmatter")


AgentStatus = Literal["Managed", "Unmanaged"]
HarnessCellState = Literal["enabled", "disabled", "found", "empty"]
AgentUpdateStatus = Literal[
    "update_available",
    "no_update_available",
    "no_source_available",
    "local_changes_detected",
]
AgentStopManagingStatus = Literal["available", "disabled_no_enabled"]


class AgentsSummaryResponse(BaseModel):
    managed: int
    unmanaged: int


class AgentHarnessColumnResponse(BaseModel):
    harness: str
    label: str
    logoKey: str | None = None
    installed: bool


class AgentRowActionsResponse(BaseModel):
    canManage: bool
    canStopManaging: bool
    canDelete: bool
    canResolveConflict: bool = False


class AgentHarnessCellResponse(BaseModel):
    harness: str
    label: str
    logoKey: str | None = None
    state: HarnessCellState
    interactive: bool


class AgentTableRowResponse(BaseModel):
    agentRef: str
    name: str
    description: str
    displayStatus: AgentStatus
    actions: AgentRowActionsResponse
    cells: list[AgentHarnessCellResponse]
    conflict: None = None


class AgentsPageResponse(BaseModel):
    summary: AgentsSummaryResponse
    harnessColumns: list[AgentHarnessColumnResponse]
    rows: list[AgentTableRowResponse]


class AgentDetailActionsResponse(BaseModel):
    canManage: bool
    stopManagingStatus: AgentStopManagingStatus | None
    stopManagingHarnessLabels: list[str]
    canDelete: bool
    deleteHarnessLabels: list[str]


class AgentLocationResponse(BaseModel):
    kind: Literal["shared", "harness"]
    harness: str | None
    label: str
    scope: str | None
    path: str | None
    revision: str | None
    sourceKind: str
    sourceLocator: str
    detail: str | None


class AgentDetailResponse(BaseModel):
    agentRef: str
    name: str
    description: str
    displayStatus: AgentStatus
    attentionMessage: str | None
    actions: AgentDetailActionsResponse
    harnessCells: list[AgentHarnessCellResponse]
    locations: list[AgentLocationResponse]
    sourceLinks: None = None
    documentMarkdown: str | None


class AgentSourceStatusResponse(BaseModel):
    updateStatus: AgentUpdateStatus | None


__all__ = [
    "AgentDetailActionsResponse",
    "AgentDetailResponse",
    "AgentHarnessCellResponse",
    "AgentHarnessColumnResponse",
    "AgentLocationResponse",
    "AgentRowActionsResponse",
    "AgentSourceStatusResponse",
    "AgentStatus",
    "AgentStatusFromPathRequest",
    "AgentStatusResultResponse",
    "AgentStopManagingStatus",
    "AgentTableRowResponse",
    "AgentUpdateStatus",
    "AgentsPageResponse",
    "AgentsSummaryResponse",
    "DisableAgentRequest",
    "EnableAgentRequest",
    "PushAgentFromPathRequest",
    "PushAgentResultResponse",
]
