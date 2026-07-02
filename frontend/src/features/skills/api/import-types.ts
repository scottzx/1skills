export interface ImportSkillDto {
  dir: string;
  name: string;
  description: string;
  sourcePath: string;
  inStore: boolean;
}

export interface ImportFolderDto {
  path: string;
  displayPath: string;
  exists: boolean;
  isDefault: boolean;
  error: string | null;
  linkedCount: number;
  skills: ImportSkillDto[];
}

export interface ImportScanResponse {
  folders: ImportFolderDto[];
}

export interface ImportApplyResultDto {
  imported: string[];
  skipped: { path: string; reason: string }[];
  failures: { path: string; error: string }[];
}
