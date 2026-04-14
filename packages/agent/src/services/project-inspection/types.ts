export interface LocalCodebaseMatch {
  path: string;
  exactBasenameMatch: boolean;
}

export interface LocalProjectInspection {
  name: string;
  path: string;
  type: string;
  packageName?: string;
  packageManager?: string;
  workspacePatterns: string[];
  scripts: string[];
  keyFolders: string[];
  git: {
    available: boolean;
    status?: string;
    recentCommit?: string;
  };
  topEntries: string[];
  readmePreview?: string;
}

export interface PackageJsonSummary {
  packageName?: string;
  packageManager?: string;
  workspacePatterns: string[];
  scripts: string[];
}
