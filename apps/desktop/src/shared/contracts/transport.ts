export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
/**
 * Structured-clone-safe side of Eliza's AgentRequestTransport contract.
 * Request and Response instances stay in the renderer; Electron IPC carries
 * only this serializable representation across the process boundary.
 */
export interface AgentTransportRequest {
  path: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string | null;
}
export interface AgentTransportResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}
export interface ChatRequest {
  requestId: string;
  message: string;
  roomId: string;
  workspacePath: string;
  projectId?: string;
  attachmentIds?: string[];
}
export interface LocalMutation {
  action: string;
  requestedPath?: string;
  resolvedPath?: string;
  success: boolean;
  message?: string;
  bytes?: number;
  replacements?: number;
  recordedAt: string;
}
export interface RunSnapshot {
  runId: string;
  sessionId: string;
  roomId: string;
  source: string;
  message: string;
  runDepth: "quick" | "standard" | "deep" | "explore";
  configuredMaxIterations: number;
  observedActionCount: number;
  progressMode: "off" | "new" | "all" | "verbose";
  status:
    | "thinking"
    | "acting"
    | "waiting"
    | "complete"
    | "cancelled"
    | "error";
  activeAction?: string;
  activeStream?: string;
  statusDetail?: string;
  lastAction?: string;
  localMutations: LocalMutation[];
  pendingApprovals: number;
  startedAt: string;
  updatedAt: string;
  lastHeartbeatAt?: string;
  endedAt?: string;
  terminalReason?: "completed" | "cancelled" | "error";
  errorMessage?: string;
}
export interface DesktopRunUpdate {
  type:
    | "started"
    | "thinking"
    | "acting"
    | "waiting"
    | "message"
    | "action-started"
    | "action-completed"
    | "local-mutation"
    | "stream"
    | "heartbeat"
    | "completed"
    | "cancelled"
    | "error"
    | "approvals";
  sessionId: string;
  run: RunSnapshot;
}
export interface ChatEvent {
  requestId: string;
  event:
    | "response.created"
    | "response.output_text.delta"
    | "agent.run"
    | "agent.progress"
    | "response.notice"
    | "response.completed"
    | "response.failed"
    | "response.cancelled"
    | "error"
    | "cancelled";
  data: unknown;
}
