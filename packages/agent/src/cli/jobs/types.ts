export type CliJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface CliJobRecord {
  id: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  status: CliJobStatus;
  logPath: string;
  stateDir: string;
  pid?: number;
  sessionId?: string;
  exitCode?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface CliJobIndex {
  jobs: CliJobRecord[];
}
