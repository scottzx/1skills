from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from skill_manager.api.deps import get_container
from skill_manager.application import BackendContainer
from skill_manager.application.skills.imports import FolderScan, ImportResult

router = APIRouter(prefix="/api/import")


class ImportScanRequest(BaseModel):
    folders: list[str] = []


class ImportApplyRequest(BaseModel):
    sourcePaths: list[str] = []


class ImportSkillResponse(BaseModel):
    dir: str
    name: str
    description: str
    sourcePath: str
    inStore: bool


class ImportFolderResponse(BaseModel):
    path: str
    displayPath: str
    exists: bool
    isDefault: bool
    error: str | None
    linkedCount: int
    skills: list[ImportSkillResponse]


class ImportScanResponse(BaseModel):
    folders: list[ImportFolderResponse]


class ImportApplyResponse(BaseModel):
    imported: list[str]
    skipped: list[dict[str, str]]
    failures: list[dict[str, str]]


def _folder_to_response(scan: FolderScan) -> ImportFolderResponse:
    return ImportFolderResponse(
        path=scan.path,
        displayPath=scan.display_path,
        exists=scan.exists,
        isDefault=scan.is_default,
        error=scan.error,
        linkedCount=scan.linked_count,
        skills=[
            ImportSkillResponse(
                dir=skill.dir,
                name=skill.name,
                description=skill.description,
                sourcePath=skill.source_path,
                inStore=skill.in_store,
            )
            for skill in scan.skills
        ],
    )


@router.post("/scan", response_model=ImportScanResponse)
def scan_import_folders(
    body: ImportScanRequest,
    container: BackendContainer = Depends(get_container),
) -> ImportScanResponse:
    scans = container.skills_imports.scan(body.folders)
    return ImportScanResponse(folders=[_folder_to_response(scan) for scan in scans])


@router.post("/apply", response_model=ImportApplyResponse)
def apply_import(
    body: ImportApplyRequest,
    container: BackendContainer = Depends(get_container),
) -> ImportApplyResponse:
    result: ImportResult = container.skills_imports.apply(body.sourcePaths)
    return ImportApplyResponse(
        imported=result.imported,
        skipped=result.skipped,
        failures=result.failures,
    )
