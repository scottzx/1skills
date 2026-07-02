import { postJson } from "../../../api/http";
import type { ImportApplyResultDto, ImportScanResponse } from "./import-types";

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
