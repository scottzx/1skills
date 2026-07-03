import { fetchJson, postJson } from "../../../api/http";
import type {
  ImportApplyResultDto,
  ImportScanResponse,
  ListDirectoriesResponse,
} from "./import-types";

/**
 * Scan the default skill locations plus any extra folders for local, non-symlink
 * skill packages that can be imported into the central store. Passing an empty
 * array still returns the default locations.
 */
export async function scanImportFolders(folders: string[]): Promise<ImportScanResponse> {
  return postJson<ImportScanResponse>("/import/scan", { folders });
}

/** Import the given skill package folders (by source path) into the central store. */
export async function applyImport(sourcePaths: string[]): Promise<ImportApplyResultDto> {
  return postJson<ImportApplyResultDto>("/import/apply", { sourcePaths });
}

/**
 * List the sub-directories of a path for the folder-tree picker. Backed by the
 * 1agents Go server's GET /api/workspace/list-directories (available when the
 * panel runs embedded in the 1agents app; empty path resolves to the home dir).
 */
export async function listDirectories(path: string): Promise<ListDirectoriesResponse> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return fetchJson<ListDirectoriesResponse>(`/workspace/list-directories${query}`);
}
