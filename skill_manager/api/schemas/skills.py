from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .common import HarnessTarget


class EnableSkillRequest(HarnessTarget):
    pass


class DisableSkillRequest(HarnessTarget):
    pass


class SetSkillHarnessesRequest(BaseModel):
    target: Literal["enabled", "disabled"] = Field(
        ...,
        description="Target state to apply to every interactive harness cell on this skill",
    )


class InstallMarketplaceSkillRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    install_token: str = Field(..., alias="installToken", min_length=1)


class ResolveSkillConflictRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    chosen_ref: str = Field(
        ...,
        alias="chosenRef",
        min_length=1,
        description="skillRef of the version to keep as the single managed copy",
    )


class PushSkillFromPathRequest(BaseModel):
    """Overwrite a managed shared-store skill with a locally-modified copy.

    The reverse of the create-time weak-copy: a workspace edited its own copy at
    ``sourcePath`` (e.g. ``<workspace>/.claude/skills/<dir>``) and now pushes it
    back to become the shared store's new baseline. The path is resolved by the
    caller (the Go host, which owns workspace→path mapping); the store fingerprints
    it and only rewrites when the content actually differs.
    """

    model_config = ConfigDict(populate_by_name=True)

    source_path: str = Field(
        ...,
        alias="sourcePath",
        min_length=1,
        description="Absolute path to the modified skill package directory",
    )


class PushSkillResultResponse(BaseModel):
    ok: bool
    status: str = Field(
        "updated",
        description="One of updated | exists | created | conflict (#379 decision tree)",
    )
    changed: bool = Field(
        ...,
        description="True when the store baseline was written; False when the copy was identical",
    )
    created: bool = Field(
        False,
        description="True when a custom skill was ingested into the store for the first time",
    )
    version: int | None = Field(
        None,
        description="The store package's version counter after the push (bumped when changed)",
    )
    id: str | None = Field(None, description="Stable skill id the push resolved to")
    conflict: dict | None = Field(
        None,
        description="Present when status=conflict: {id, name, storeVersion, baseVersion, sourcePath}",
    )


class ResolvePushConflictRequest(BaseModel):
    """Resolve a concurrent-edit push (#379): the pushed content always lands as
    a new fork; ``resolution`` only chooses who is primary (main/fork)."""

    model_config = ConfigDict(populate_by_name=True)

    source_path: str = Field(..., alias="sourcePath", min_length=1)
    base_id: str = Field(..., alias="baseId", min_length=1)
    resolution: Literal["main", "fork"] = Field(...)
    name: str | None = Field(None, description="Optional new display name for the fork")


class SkillStatusFromPathRequest(BaseModel):
    """Read-only counterpart to PushSkillFromPathRequest — report a workspace
    copy's status against the store baseline without mutating it."""

    model_config = ConfigDict(populate_by_name=True)

    source_path: str = Field(
        ...,
        alias="sourcePath",
        min_length=1,
        description="Absolute path to the workspace's skill package directory",
    )


class SkillStatusResultResponse(BaseModel):
    inStore: bool = Field(..., description="True when the store (母体) already has this package")
    differs: bool = Field(..., description="True when the workspace copy differs from the store baseline")
    exists: bool = Field(..., description="False when no skill package was found at the given path")
    name: str = Field("", description="Declared name from the workspace copy's SKILL.md frontmatter")
    description: str = Field("", description="Description from the workspace copy's SKILL.md frontmatter")
    storeVersion: int | None = Field(
        None, description="The store package's current version counter, or null when not in store"
    )


SkillStatus = Literal["Managed", "Unmanaged"]
HarnessCellState = Literal["enabled", "disabled", "found", "empty"]
SkillUpdateStatus = Literal[
    "update_available",
    "no_update_available",
    "no_source_available",
    "local_changes_detected",
]
SkillStopManagingStatus = Literal["available", "disabled_no_enabled"]


class SetSkillHarnessesFailureResponse(BaseModel):
    harness: str
    error: str


class SetSkillHarnessesResultResponse(BaseModel):
    ok: bool
    succeeded: list[str]
    failed: list[SetSkillHarnessesFailureResponse]


class BulkManageFailureResponse(BaseModel):
    skillRef: str
    name: str
    error: str


class BulkManageResultResponse(BaseModel):
    ok: bool
    managedCount: int
    skippedCount: int
    failures: list[BulkManageFailureResponse]


class SkillsSummaryResponse(BaseModel):
    managed: int
    unmanaged: int


class HarnessColumnResponse(BaseModel):
    harness: str
    label: str
    logoKey: str | None = None
    installed: bool


class SkillRowActionsResponse(BaseModel):
    canManage: bool
    canStopManaging: bool
    canDelete: bool
    canResolveConflict: bool = False


class SkillConflictLocationResponse(BaseModel):
    harness: str | None
    label: str
    scope: str | None
    path: str | None


class SkillConflictVersionResponse(BaseModel):
    skillRef: str
    isManaged: bool
    revision: str | None
    modifiedAt: float | None
    locations: list[SkillConflictLocationResponse]


class SkillConflictResponse(BaseModel):
    versions: list[SkillConflictVersionResponse]


class HarnessCellResponse(BaseModel):
    harness: str
    label: str
    logoKey: str | None = None
    state: HarnessCellState
    interactive: bool


class SkillTableRowResponse(BaseModel):
    skillRef: str
    name: str
    description: str
    displayStatus: SkillStatus
    actions: SkillRowActionsResponse
    cells: list[HarnessCellResponse]
    conflict: SkillConflictResponse | None = None


class SkillsPageResponse(BaseModel):
    summary: SkillsSummaryResponse
    harnessColumns: list[HarnessColumnResponse]
    rows: list[SkillTableRowResponse]


class SkillDetailActionsResponse(BaseModel):
    canManage: bool
    stopManagingStatus: SkillStopManagingStatus | None
    stopManagingHarnessLabels: list[str]
    canDelete: bool
    deleteHarnessLabels: list[str]


class SkillLocationResponse(BaseModel):
    kind: Literal["shared", "harness"]
    harness: str | None
    label: str
    scope: str | None
    path: str | None
    revision: str | None
    sourceKind: str
    sourceLocator: str
    detail: str | None


class SkillSourceLinksResponse(BaseModel):
    repoLabel: str
    repoUrl: str
    folderUrl: str | None


class SkillLineageInfoResponse(BaseModel):
    id: str | None = None
    version: int = 1
    forkedFrom: str | None = None
    forkedFromVersion: int | None = None
    isPrimary: bool = True


class SkillDetailResponse(BaseModel):
    skillRef: str
    name: str
    description: str
    displayStatus: SkillStatus
    attentionMessage: str | None
    lineage: SkillLineageInfoResponse | None = None
    actions: SkillDetailActionsResponse
    harnessCells: list[HarnessCellResponse]
    locations: list[SkillLocationResponse]
    sourceLinks: SkillSourceLinksResponse | None
    documentMarkdown: str | None


class SkillSourceStatusResponse(BaseModel):
    updateStatus: SkillUpdateStatus | None


__all__ = [
    "BulkManageFailureResponse",
    "BulkManageResultResponse",
    "DisableSkillRequest",
    "EnableSkillRequest",
    "HarnessCellResponse",
    "HarnessCellState",
    "HarnessColumnResponse",
    "InstallMarketplaceSkillRequest",
    "ResolveSkillConflictRequest",
    "SkillConflictLocationResponse",
    "SkillConflictResponse",
    "SkillConflictVersionResponse",
    "SetSkillHarnessesFailureResponse",
    "SetSkillHarnessesRequest",
    "SetSkillHarnessesResultResponse",
    "SkillDetailActionsResponse",
    "SkillDetailResponse",
    "SkillLocationResponse",
    "SkillRowActionsResponse",
    "SkillSourceLinksResponse",
    "SkillSourceStatusResponse",
    "SkillStatus",
    "SkillStopManagingStatus",
    "SkillTableRowResponse",
    "SkillUpdateStatus",
    "SkillsPageResponse",
    "SkillsSummaryResponse",
]
