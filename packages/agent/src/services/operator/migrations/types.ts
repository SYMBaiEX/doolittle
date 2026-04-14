export interface MigrationSourceSummary {
  id: string;
  label: string;
  path: string;
  exists: boolean;
}

export interface MigrationInspectionFile {
  path: string;
  kind: "context" | "memory" | "persona" | "skill" | "other";
}

export interface MigrationInspection {
  rootPath: string;
  exists: boolean;
  files: MigrationInspectionFile[];
  skillCount: number;
  contextCount: number;
}

export interface MigrationResult {
  sourcePath: string;
  destinationPath: string;
  importedFiles: string[];
  importedSkills: string[];
  skippedFiles: string[];
  reportPath: string;
}

export interface MigrationHistoryEntry {
  createdAt: string;
  sourcePath: string;
  destinationPath: string;
  importedFiles: string[];
  importedSkills: string[];
  skippedFiles: string[];
  reportPath: string;
}
