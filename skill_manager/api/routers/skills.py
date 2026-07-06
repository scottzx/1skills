from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from skill_manager.application import BackendContainer
from skill_manager.api.deps import get_container
from skill_manager.api.schemas import (
    BulkManageResultResponse,
    DisableSkillRequest,
    EnableSkillRequest,
    OkResponse,
    PendingConflictsResponse,
    PullSkillResultResponse,
    PullSkillToPathRequest,
    PushSkillFromPathRequest,
    PushSkillResultResponse,
    ResolvePendingConflictRequest,
    ResolvePushConflictRequest,
    SkillStatusFromPathRequest,
    SkillStatusResultResponse,
    ResolveSkillConflictRequest,
    SetSkillHarnessesRequest,
    SetSkillHarnessesResultResponse,
    SkillDetailResponse,
    SkillsPageResponse,
    SkillSourceStatusResponse,
)

router = APIRouter(prefix="/api/skills")


@router.get("", response_model=SkillsPageResponse)
def list_skills(container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    return container.skills_queries.list_skills()


# --- Stable-id versioning & lineage (#379). Registered before the
# {skill_ref:path} catch-all so `id/...` isn't swallowed by it. ---


@router.get("/id/{skill_id}/versions")
def list_skill_versions(skill_id: str, container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    payload = container.skills_queries.list_skill_versions(skill_id)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"unknown skill id: {skill_id}")
    return payload


@router.get("/id/{skill_id}/lineage")
def get_skill_lineage(skill_id: str, container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    payload = container.skills_queries.get_skill_lineage(skill_id)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"unknown skill id: {skill_id}")
    return payload


@router.get("/id/{skill_id}/diff")
def diff_skill_versions(
    skill_id: str,
    from_version: int,
    to_version: int | None = None,
    container: BackendContainer = Depends(get_container),
) -> dict[str, object]:
    payload = container.skills_queries.diff_skill_versions(skill_id, from_version, to_version)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"unknown skill id or version: {skill_id}")
    return payload


@router.post("/id/{skill_id}/restore/{version}")
def restore_skill_version(
    skill_id: str,
    version: int,
    container: BackendContainer = Depends(get_container),
) -> dict[str, object]:
    return container.skills_mutations.restore_skill_version(skill_id, version)


@router.post("/id/{skill_id}/promote")
def promote_skill(skill_id: str, container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    return container.skills_mutations.promote_skill(skill_id)


@router.post("/resolve-push")
def resolve_push_conflict(
    body: ResolvePushConflictRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, object]:
    return container.skills_mutations.resolve_push_conflict(
        source_path=body.source_path,
        base_id=body.base_id,
        resolution=body.resolution,
        name=body.name,
    )


@router.get("/pending-conflicts", response_model=PendingConflictsResponse)
def list_pending_conflicts(container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    return container.skills_queries.list_pending_conflicts()


@router.post("/pending-conflicts/resolve")
def resolve_pending_conflict(
    body: ResolvePendingConflictRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, object]:
    return container.skills_mutations.resolve_pending_conflict(
        conflict_id=body.conflict_id,
        resolution=body.resolution,
        name=body.name,
    )


@router.get("/{skill_ref:path}/source-status", response_model=SkillSourceStatusResponse)
def get_skill_source_status(skill_ref: str, container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    payload = container.skills_queries.get_skill_source_status(skill_ref)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"unknown skill ref: {skill_ref}")
    return payload


@router.get("/{skill_ref:path}", response_model=SkillDetailResponse)
def get_skill_detail(skill_ref: str, container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    payload = container.skills_queries.get_skill_detail(skill_ref)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"unknown skill ref: {skill_ref}")
    return payload


@router.post("/{skill_ref:path}/enable", response_model=OkResponse)
def enable_skill(
    skill_ref: str,
    body: EnableSkillRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, bool]:
    return container.skills_mutations.enable_skill(skill_ref, body.harness)


@router.post("/{skill_ref:path}/disable", response_model=OkResponse)
def disable_skill(
    skill_ref: str,
    body: DisableSkillRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, bool]:
    return container.skills_mutations.disable_skill(skill_ref, body.harness)


@router.post("/{skill_ref:path}/set-harnesses", response_model=SetSkillHarnessesResultResponse)
def set_skill_harnesses(
    skill_ref: str,
    body: SetSkillHarnessesRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, object]:
    return container.skills_mutations.set_skill_all_harnesses(skill_ref, body.target)


@router.post("/{skill_ref:path}/manage", response_model=OkResponse)
def manage_skill(skill_ref: str, container: BackendContainer = Depends(get_container)) -> dict[str, bool]:
    return container.skills_mutations.manage_skill(skill_ref)


@router.post("/manage-all", response_model=BulkManageResultResponse)
def manage_all_skills(container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    return container.skills_mutations.manage_all_skills()


@router.post("/{skill_ref:path}/resolve-conflict", response_model=OkResponse)
def resolve_skill_conflict(
    skill_ref: str,
    body: ResolveSkillConflictRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, bool]:
    return container.skills_mutations.resolve_skill_conflict(skill_ref, body.chosen_ref)


@router.post("/{skill_ref:path}/update", response_model=OkResponse)
def update_skill(skill_ref: str, container: BackendContainer = Depends(get_container)) -> dict[str, bool]:
    return container.skills_mutations.update_skill(skill_ref)


@router.post("/{skill_ref:path}/status-from-path", response_model=SkillStatusResultResponse)
def skill_status_from_path(
    skill_ref: str,
    body: SkillStatusFromPathRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, object]:
    return container.skills_queries.skill_status_from_path(skill_ref, body.source_path)


@router.post("/{skill_ref:path}/preview-push")
def preview_push_from_path(
    skill_ref: str,
    body: SkillStatusFromPathRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, object]:
    return container.skills_queries.preview_push_from_path(skill_ref, body.source_path)


@router.post("/{skill_ref:path}/push-from-path", response_model=PushSkillResultResponse)
def push_skill_from_path(
    skill_ref: str,
    body: PushSkillFromPathRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, object]:
    return container.skills_mutations.push_skill_from_path(skill_ref, body.source_path)


@router.post("/{skill_ref:path}/pull-to-path", response_model=PullSkillResultResponse)
def pull_skill_to_path(
    skill_ref: str,
    body: PullSkillToPathRequest,
    container: BackendContainer = Depends(get_container),
) -> dict[str, object]:
    return container.skills_mutations.pull_skill_to_path(skill_ref, body.target_path)


@router.post("/{skill_ref:path}/unmanage", response_model=OkResponse)
def unmanage_skill(skill_ref: str, container: BackendContainer = Depends(get_container)) -> dict[str, bool]:
    return container.skills_mutations.unmanage_skill(skill_ref)


@router.post("/{skill_ref:path}/delete", response_model=OkResponse)
def delete_skill(skill_ref: str, container: BackendContainer = Depends(get_container)) -> dict[str, bool]:
    return container.skills_mutations.delete_skill(skill_ref)
