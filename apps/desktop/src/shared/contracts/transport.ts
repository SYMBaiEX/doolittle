export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export const DESKTOP_REQUEST_TIMEOUT_MS = 15_000;
export const DESKTOP_MEDIA_REQUEST_TIMEOUT_MS = 180_000;
// ACP prompts execute a full agent turn (including tools and model latency),
// while the editor independently polls structured progress updates. They need
// the same bounded window as other long-running local work rather than the
// short request budget used for ordinary desktop API calls.
export const DESKTOP_ACP_PROMPT_REQUEST_TIMEOUT_MS = 180_000;
export const DESKTOP_REGISTRY_INSTALL_TIMEOUT_MS = 120_000;

/** Returns the bounded desktop budget for an API operation. */
export function desktopRequestTimeoutMs(path: string): number {
  const pathname = path.split("?", 1)[0];
  if (pathname === "/acp/session/prompt") {
    return DESKTOP_ACP_PROMPT_REQUEST_TIMEOUT_MS;
  }
  if (pathname === "/runtime/registry/install") {
    return DESKTOP_REGISTRY_INSTALL_TIMEOUT_MS;
  }
  if (
    pathname === "/media/transcribe-attachment" ||
    pathname === "/media/transcribe" ||
    pathname === "/media/generate" ||
    pathname === "/media/speak" ||
    pathname === "/media/inspect" ||
    pathname === "/media/analyze"
  ) {
    return DESKTOP_MEDIA_REQUEST_TIMEOUT_MS;
  }
  return DESKTOP_REQUEST_TIMEOUT_MS;
}
/**
 * Structured-clone-safe side of Eliza's AgentRequestTransport contract.
 * Request and Response instances stay in the renderer; Electron IPC carries
 * only this serializable representation across the process boundary.
 */
export interface AgentTransportRequest {
  /** Sender-scoped identifier used for cancellation and lifecycle cleanup. */
  requestId: string;
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
  /** Opaque desktop-only cleanup leases. Never forwarded to the runtime. */
  attachmentCleanup?: Record<string, string>;
}

/** Resume the event feed for an already-submitted, server-owned chat run. */
export interface ChatRunSubscription {
  requestId: string;
  /** The last durable event id rendered by this desktop window. */
  after?: number;
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
  firstStatusAt?: string;
  firstMessageAt?: string;
  firstActionAt?: string;
  lastMeaningfulActivityAt?: string;
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

export interface ChatTextPartDelta {
  id: string;
  delta: string;
  /** Stable logical part identity across reconnect/replay. */
  part_id: "assistant-text";
  /** Monotonic sequence within the logical part. */
  sequence: number;
}

export interface ChatRunResultSummary {
  outcome: "completed" | "cancelled" | "failed";
  changedFiles: string[];
  failedChanges: number;
  actionCount: number;
  lastAction?: string;
  durationMs: number;
  timeToFirstMessageMs?: number;
  timeToFirstActionMs?: number;
}

export interface ChatCompletedPayload {
  id: string;
  response: string;
  character: string;
  room_id: string;
  result?: ChatRunResultSummary;
}
export interface ChatEvent {
  requestId: string;
  /** Monotonic server event id. Undefined only for local transport failures. */
  eventId?: number;
  event:
    | "response.created"
    | "response.output_text.delta"
    | "agent.run"
    | "agent.progress"
    | "response.notice"
    | "attachment.warning"
    | "response.completed"
    | "response.failed"
    | "response.cancelled"
    | "error"
    | "cancelled";
  data: unknown;
}
