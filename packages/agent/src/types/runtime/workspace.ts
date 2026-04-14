export interface ContextDocument {
  name: string;
  path: string;
  content: string;
}

export interface WorkspaceEntry {
  path: string;
  type: "file" | "directory";
  depth: number;
}
