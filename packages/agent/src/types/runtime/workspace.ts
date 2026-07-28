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

export interface WorkspaceCheckpoint {
  id: string;
  createdAt: string;
  label: string;
  revision: string;
}

export interface WorkspaceCheckpointSupport {
  supported: boolean;
  reason?: string;
}
