import type {
  BulkManageResult,
  DisableSkillRequest,
  EnableSkillRequest,
  OkResponse,
  PendingConflictsDto,
  PromoteSkillResult,
  ResolvePendingConflictRequest,
  ResolvePendingConflictResult,
  RestoreSkillVersionResult,
  SetSkillHarnessesRequest,
  SetSkillHarnessesResultDto,
  SkillDetailDto,
  SkillLineageDto,
  SkillsPageDto,
  SkillSourceStatusDto,
  SkillVersionDiffDto,
  SkillVersionsDto,
} from "./types";
import { fetchJson, postJson } from "../../../api/http";

export async function fetchSkillsPage(): Promise<SkillsPageDto> {
  return fetchJson<SkillsPageDto>("/skills");
}

export async function fetchSkillDetail(skillRef: string): Promise<SkillDetailDto> {
  return fetchJson<SkillDetailDto>(`/skills/${encodeURIComponent(skillRef)}`);
}

export async function fetchSkillSourceStatus(skillRef: string): Promise<SkillSourceStatusDto> {
  return fetchJson<SkillSourceStatusDto>(`/skills/${encodeURIComponent(skillRef)}/source-status`);
}

export async function enableSkill(skillRef: string, harness: string): Promise<OkResponse> {
  const body: EnableSkillRequest = { harness };
  return postJson<OkResponse>(`/skills/${encodeURIComponent(skillRef)}/enable`, body);
}

export async function disableSkill(skillRef: string, harness: string): Promise<OkResponse> {
  const body: DisableSkillRequest = { harness };
  return postJson<OkResponse>(`/skills/${encodeURIComponent(skillRef)}/disable`, body);
}

export async function setSkillHarnesses(
  skillRef: string,
  target: "enabled" | "disabled",
): Promise<SetSkillHarnessesResultDto> {
  const body: SetSkillHarnessesRequest = { target };
  return postJson<SetSkillHarnessesResultDto>(
    `/skills/${encodeURIComponent(skillRef)}/set-harnesses`,
    body,
  );
}

export async function manageSkill(skillRef: string): Promise<OkResponse> {
  return postJson<OkResponse>(`/skills/${encodeURIComponent(skillRef)}/manage`);
}

export async function updateSkill(skillRef: string): Promise<OkResponse> {
  return postJson<OkResponse>(`/skills/${encodeURIComponent(skillRef)}/update`);
}

export async function unmanageSkill(skillRef: string): Promise<OkResponse> {
  return postJson<OkResponse>(`/skills/${encodeURIComponent(skillRef)}/unmanage`);
}

export async function deleteSkill(skillRef: string): Promise<OkResponse> {
  return postJson<OkResponse>(`/skills/${encodeURIComponent(skillRef)}/delete`);
}

export async function fetchSkillVersions(id: string): Promise<SkillVersionsDto> {
  return fetchJson<SkillVersionsDto>(`/skills/id/${encodeURIComponent(id)}/versions`);
}

export async function fetchSkillLineage(id: string): Promise<SkillLineageDto> {
  return fetchJson<SkillLineageDto>(`/skills/id/${encodeURIComponent(id)}/lineage`);
}

export async function fetchSkillVersionDiff(
  id: string,
  fromVersion: number,
  toVersion?: number,
): Promise<SkillVersionDiffDto> {
  const query = `from_version=${fromVersion}${toVersion != null ? `&to_version=${toVersion}` : ""}`;
  return fetchJson<SkillVersionDiffDto>(`/skills/id/${encodeURIComponent(id)}/diff?${query}`);
}

export async function restoreSkillVersion(id: string, version: number): Promise<RestoreSkillVersionResult> {
  return postJson<RestoreSkillVersionResult>(
    `/skills/id/${encodeURIComponent(id)}/restore/${encodeURIComponent(String(version))}`,
  );
}

export async function promoteSkill(id: string): Promise<PromoteSkillResult> {
  return postJson<PromoteSkillResult>(`/skills/id/${encodeURIComponent(id)}/promote`);
}

export async function fetchPendingConflicts(): Promise<PendingConflictsDto> {
  return fetchJson<PendingConflictsDto>("/skills/pending-conflicts");
}

export async function resolvePendingConflict(
  body: ResolvePendingConflictRequest,
): Promise<ResolvePendingConflictResult> {
  return postJson<ResolvePendingConflictResult>("/skills/pending-conflicts/resolve", body);
}

export async function manageAllSkills(): Promise<BulkManageResult> {
  const result = await postJson<BulkManageResult>("/skills/manage-all");
  if (!result.ok) {
    const firstFailure = result.failures[0];
    throw new Error(firstFailure?.error ?? "Unable to manage all eligible skills.");
  }
  return result;
}
