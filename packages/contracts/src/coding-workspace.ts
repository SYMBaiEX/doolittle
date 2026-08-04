/** Shared structural contracts between the coding plugin and its host workspace. */
export interface LocalCodebaseMatch {
  path: string;
  exactBasenameMatch: boolean;
}

export interface LocalProjectTarget {
  path: string;
  kind: "directory" | "file";
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
  notableFiles?: string[];
  git: {
    available: boolean;
    status?: string;
    recentCommit?: string;
  };
  topEntries: string[];
  readmePreview?: string;
}

export interface WorkspaceReadLinesResult {
  path: string;
  offset: number;
  end: number;
  total: number;
  lines: Array<{ number: number; text: string }>;
}

export interface WorkspaceWriteResult {
  path: string;
  bytes: number;
}

export interface WorkspaceDirectoryResult {
  path: string;
  existed: boolean;
}

export interface WorkspacePatchResult extends WorkspaceWriteResult {
  replacements: number;
}

export interface WorkspaceFileSearchInput {
  pattern: string;
  path?: string;
  target?: "content" | "files";
  limit?: number;
}

export interface WorkspaceFileSearchMatch {
  path: string;
  line?: number;
  text?: string;
}

export interface WorkspaceFileSearchResult {
  root: string;
  pattern: string;
  target: "content" | "files";
  matches: WorkspaceFileSearchMatch[];
}
