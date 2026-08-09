export type BackendPhase = "booting" | "ready" | "degraded" | "stopped";

export interface BackendState {
  phase: BackendPhase;
  url?: string;
  message: string;
  detail?: string;
}

export interface HealthResponse {
  status: string;
  name: string;
  mode: string;
  processId: number;
  workspaceDir: string;
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

export interface WorkspaceCheckpointsResponse {
  support: WorkspaceCheckpointSupport;
  checkpoints: WorkspaceCheckpoint[];
}

export interface CommandCatalogItem {
  command: string;
  category: string;
  description: string;
  aliases?: string[];
  disabledReason?: string;
}

export interface CommandCatalogResponse {
  commands: CommandCatalogItem[];
}
