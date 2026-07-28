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

export interface SessionSummary {
  sessionId: string;
  projectId?: string;
  title?: string;
  continuityKey?: string;
  parentSessionId?: string;
  forkedFromMessageId?: string;
  rootSessionId?: string;
  messageCount: number;
  startedAt?: string;
  endedAt?: string;
  participants: Array<"user" | "assistant" | "system">;
  preview: string[];
}

export interface SessionsResponse {
  sessions: SessionSummary[];
}

export type ProjectResourceKind =
  | "file"
  | "folder"
  | "link"
  | "note"
  | "source";

export interface ProjectResource {
  id: string;
  projectId: string;
  kind: ProjectResourceKind;
  label: string;
  value: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  primaryPath?: string;
  pinned: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  resources: ProjectResource[];
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface ProjectResponse {
  project: Project;
}

export interface StoredMessage {
  id: string;
  originMessageId?: string;
  sessionId: string;
  roomId: string;
  entityId: string;
  role: "user" | "assistant" | "system";
  text: string;
  attachments?: ManagedAttachmentDescriptor[];
  createdAt: string;
}

export interface SessionMessagesResponse {
  messages: StoredMessage[];
}

export interface SessionForkRequest {
  sourceSessionId: string;
  throughMessageId?: string;
  beforeMessageId?: string;
}

export interface SessionForkResult {
  sessionId: string;
  sourceSessionId: string;
  parentSessionId: string;
  forkedFromMessageId: string;
  rootSessionId: string;
  boundaryMode: "before" | "full" | "through";
  copiedThroughMessageId?: string;
  continuityKey: string;
  copiedMessageCount: number;
  projectId?: string;
  summary: SessionSummary;
}

export interface SessionForkResponse {
  fork: SessionForkResult;
}

export type ActivityEventKind =
  | "chat-run"
  | "automation"
  | "delegation"
  | "approval"
  | "delivery";

export type ActivityEventStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped"
  | "approved"
  | "denied"
  | "expired"
  | "used"
  | "delivered";

export type ActivityEventTarget =
  | "chat"
  | "review"
  | "automations"
  | "orchestration";

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  sourceId: string;
  sessionId?: string;
  status: ActivityEventStatus;
  occurredAt: string;
  title: string;
  safeSummary: string;
  target: ActivityEventTarget;
}

export interface ActivityFeedResponse {
  events: ActivityEvent[];
  cursor: string | null;
  updatedAt: string | null;
}

export interface SessionSearchHit {
  sessionId: string;
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}

export interface SessionSearchResponse {
  hits: SessionSearchHit[];
}

export interface SessionUsageSummary {
  sessionId: string;
  title?: string;
  continuityKey?: string;
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  systemMessages: number;
  startedAt?: string;
  endedAt?: string;
  characterCount: number;
  estimatedTokens: number;
  context?: {
    estimatedTokens: number;
    contextWindowTokens: number;
    usageFraction: number;
    percent: number;
    overThreshold: boolean;
    estimated: true;
    sampledMessages: number;
    totalMessages: number;
    truncated: boolean;
    provider: string;
    model: string;
  };
  lastPreview?: string;
}

export interface RuntimeStatus {
  provider: string;
  model: string;
  startup?: unknown;
  plugins: Record<string, boolean>;
  native?: {
    catalog?: unknown[];
    grouped?: Record<string, unknown[]>;
  };
  fallback?: {
    offlineBootstrapMode?: boolean;
  };
  gateway?: unknown;
  ownership?: Record<string, unknown>;
}

export interface PluginsResponse {
  catalog?: unknown[];
  grouped?: Record<string, unknown[]>;
  serviceRegistry?: unknown;
  pluginManager?: unknown;
  ownership?: Record<string, unknown>;
}

export interface SettingsResponse {
  settings: Record<string, unknown>;
}

export interface ThemeResponse {
  active: string;
  profile: unknown;
  themes: unknown[];
}

export interface AccountsResponse {
  activeProvider?: string;
  accounts?: Record<string, unknown>;
  connect?: Record<string, unknown>;
}

export interface PersonalityResponse {
  profile?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  card?: Record<string, unknown>;
  beliefs?: Record<string, unknown>;
  engagement?: unknown;
  relationship?: unknown;
  context?: unknown;
  hits?: unknown[];
  users?: unknown[];
  userId?: string;
  result?: Record<string, unknown>;
}

/** The exact read-only response returned by GET /profiles/users/recall. */
export interface SavedProfileRecallHit {
  kind: string;
  value: string;
  score: number;
}

export interface SavedProfileRecallResponse {
  hits: SavedProfileRecallHit[];
}

export interface SkillsResponse {
  skills?: unknown[];
  hub?: unknown;
  workspace?: unknown;
}

export interface SkillsSummaryResponse {
  summary?: unknown;
  hub?: unknown;
  installed?: unknown;
}

export interface ToolResponse {
  tools?: unknown[];
  summary?: unknown;
  nativePluginManager?: unknown;
}

export interface ToolSummaryResponse {
  summary?: unknown;
  nativePluginManager?: unknown;
}

/**
 * Read-only desktop view of Doolittle's configured ACP command bridge.
 * This is intentionally not an editor-protocol compatibility contract.
 */
export interface AcpBridgeStatus {
  enabled: boolean;
  detail: string;
  command?: string;
  timeoutMs: number;
  toolCount?: number;
  lastProbeAt?: string;
  lastError?: string;
}

export interface AcpBridgeEditorSummary {
  commandConfigured: boolean;
  registryPath?: string;
  installCommand?: string;
}

export interface AcpBridgeSessionSummary {
  totalSessions: number;
  recentSessionIds: string[];
  titledSessions: number;
  recentTitles: string[];
}

export interface AcpBridgeTool {
  name: string;
  description: string;
  kind: string;
  source: string;
}

export interface AcpStatusResponse {
  acp: AcpBridgeStatus;
}

export interface AcpEditorResponse {
  editor: AcpBridgeEditorSummary;
}

export interface AcpSessionsResponse {
  sessions: AcpBridgeSessionSummary;
}

export interface AcpToolsResponse {
  tools: AcpBridgeTool[];
}

export interface AcpProbeResponse {
  probe: { ok: boolean; detail: string };
}

export interface CronJob {
  id?: string;
  name?: string;
  schedule?: string;
  prompt?: string;
  status?: string;
  delivery?: string;
  nextRunAt?: string;
  createdAt?: string;
  updatedAt?: string;
  skills?: unknown[];
  runtime?: unknown;
}

export interface CronJobRun {
  id?: string;
  jobId?: string;
  state?: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
  output?: string;
}

export interface CronJobsResponse {
  jobs: CronJob[];
}

export interface CronRunsResponse {
  runs: CronJobRun[];
}

export interface CronMutationResponse {
  job?: CronJob;
}

export interface SettingsMutationRequest {
  path: string;
  value: unknown;
}

export interface ThemeMutationRequest {
  theme?: string;
}

export interface AccountActionRequest {
  provider?: string;
}

export interface PersonalityActionRequest {
  userId?: string;
  query?: string;
  mode?: string;
}

export interface SessionTitleRequest {
  sessionId: string;
  title: string;
}

export interface CronCreateRequest {
  name?: string;
  prompt: string;
  schedule: string;
  skills?: string[];
  delivery?: "origin" | "local" | "home";
  runtime?: {
    provider?: string;
    model?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    personalityId?: string;
  };
}

export interface CronPatchRequest extends CronCreateRequest {
  clearRuntime?: boolean;
}

export interface ApiRequestQuery {
  [key: string]: string | readonly string[];
}

export type ApiRequestBody = unknown;

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type ApiMethod = HttpMethod;

export type AllowedGetPath =
  | "/health"
  | "/activity"
  | `/activity?${string}`
  | "/runtime/status"
  | "/runtime/compatibility"
  | "/runtime/plugins"
  | "/runtime/registry"
  | "/runtime/accounts"
  | "/runtime/ecosystem"
  | `/runtime/ecosystem?${string}`
  | "/sessions"
  | `/sessions?${string}`
  | "/sessions/search"
  | `/sessions/search?${string}`
  | "/sessions/messages"
  | `/sessions/messages?${string}`
  | "/sessions/summary"
  | `/sessions/summary?${string}`
  | "/sessions/continuity"
  | `/sessions/continuity?${string}`
  | "/sessions/usage"
  | `/sessions/usage?${string}`
  | "/sessions/export"
  | `/sessions/export?${string}`
  | "/projects"
  | `/projects?${string}`
  | `/projects/${string}`
  | `/projects/${string}/resources`
  | `/runtime/registry?${string}`
  | "/settings"
  | "/theme"
  | "/execution/status"
  | "/execution/approvals"
  | `/execution/approvals?${string}`
  | "/skills"
  | "/skills/summary"
  | "/skills/installed"
  | "/skills/catalog"
  | `/skills/catalog?${string}`
  | "/tools"
  | "/tools/summary"
  | "/acp/status"
  | "/acp/editor"
  | `/acp/sessions?${string}`
  | `/acp/tools?${string}`
  | "/mcp/status"
  | "/mcp/cached"
  | `/mcp/cached/search?${string}`
  | `/mcp/cached/describe?${string}`
  | `/mcp/tool?${string}`
  | "/personality"
  | "/profiles/agent"
  | "/profiles/summary"
  | `/profiles/users/recall?${string}`
  | "/gateway/health"
  | "/gateway/runtime"
  | "/gateway/daemon"
  | "/gateway/state"
  | `/gateway/state?${string}`
  | "/gateway/inbox"
  | `/gateway/inbox?${string}`
  | "/gateway/outbox"
  | `/gateway/outbox?${string}`
  | "/sessions/gateway"
  | "/insights"
  | "/memory"
  | `/memory?${string}`
  | "/memory/summary"
  | `/memory/summary?${string}`
  | "/media/inspect"
  | `/media/inspect?${string}`
  | "/runtime/media"
  | "/secrets"
  | "/analytics"
  | "/logs"
  | `/logs?${string}`
  | "/cron/jobs"
  | "/cron/runs"
  | "/deliveries"
  | "/terminal/history"
  | "/browser/status"
  | `/browser/inspect?${string}`
  | "/doctor"
  | "/setup/checklist"
  | "/setup/summary"
  | "/update/preview"
  | "/workspace/tree"
  | `/workspace/tree?${string}`
  | `/workspace/read?${string}`
  | `/workspace/search?${string}`
  | "/repo/status"
  | "/repo/diff"
  | "/repo/log"
  | "/repo/summary"
  | "/repo/review"
  | "/repo/changes"
  | `/repo/changes?${string}`
  | "/repo/patch"
  | `/repo/patch?${string}`
  | "/repo/worktrees"
  | "/plans"
  | `/plans/${string}`
  | "/delegation/tasks"
  | `/delegation/tasks?${string}`
  | "/delegation/overview"
  | "/delegation/groups"
  | "/delegation/workers"
  | `/delegation/workers?${string}`
  | `/delegation/tasks/${string}`
  | `/delegation/tasks/${string}/children`
  | `/delegation/tasks/${string}/tree`
  | "/runtime/codegen"
  | "/codegen/runs"
  | "/chat/runs"
  | `/chat/runs?${string}`
  | `/chat/runs/${string}`
  | `/codegen/runs/${string}`
  | "/codegen/workflows"
  | `/codegen/workflows/${string}`;

export type AllowedPostPath =
  | "/settings"
  | "/acp/probe"
  | "/mcp/probe"
  | "/gateway/replay"
  | "/theme"
  | "/personality"
  | "/sessions/title"
  | "/sessions/fork"
  | "/sessions/import/preview"
  | "/sessions/import"
  | "/sessions/project"
  | "/projects"
  | `/projects/${string}/archive`
  | `/projects/${string}/resources`
  | "/accounts/refresh"
  | "/accounts/use"
  | "/accounts/connect"
  | "/accounts/login"
  | "/accounts/setup-token"
  | "/media/analyze"
  | "/media/transcribe"
  | "/media/transcribe-attachment"
  | "/media/speak"
  | "/media/generate"
  | "/secrets/get"
  | "/secrets/set"
  | "/cron/jobs"
  | `/execution/approvals/${string}/approve`
  | `/execution/approvals/${string}/deny`
  | "/plans/create"
  | `/plans/${string}/approve`
  | `/plans/${string}/steer`
  | "/delegation/tasks"
  | "/delegation/supervise"
  | `/delegation/tasks/${string}/spawn`
  | `/delegation/tasks/${string}/execute`
  | `/delegation/tasks/${string}/note`
  | `/delegation/tasks/${string}/run`
  | `/delegation/tasks/${string}/retry`
  | `/delegation/tasks/${string}/cancel`
  | `/delegation/tasks/${string}/complete`
  | `/delegation/tasks/${string}/fail`
  | "/codegen/generate"
  | `/chat/runs/${string}/cancel`
  | "/codegen/research"
  | "/codegen/prd"
  | "/codegen/qa"
  | `/codegen/runs/${string}/cancel`
  | `/codegen/workflows/${string}/bundle`
  | "/browser/capture"
  | "/browser/screenshot"
  | "/browser/snapshot"
  | "/browser/analyze"
  | "/browser/compare"
  | "/browser/compare/analyze"
  | `/cron/jobs/${string}/pause`
  | `/cron/jobs/${string}/resume`
  | `/cron/jobs/${string}/run`
  | `/cron/jobs/${string}/trigger`;

export type AllowedPatchPath = `/cron/jobs/${string}` | `/projects/${string}`;
export type AllowedDeletePath =
  | `/cron/jobs/${string}`
  | `/projects/${string}/resources/${string}`;

export interface ApiGetRequest {
  path: AllowedGetPath;
  method?: "GET";
  body?: never;
}

export interface ApiPostRequest {
  path: AllowedPostPath;
  method: "POST";
  body?: ApiRequestBody;
}

export interface ApiPatchRequest {
  path: AllowedPatchPath;
  method: "PATCH";
  body?: ApiRequestBody;
}

export interface ApiDeleteRequest {
  path: AllowedDeletePath;
  method: "DELETE";
  body?: ApiRequestBody;
}

export type ApiRequest =
  | ApiGetRequest
  | ApiPostRequest
  | ApiPatchRequest
  | ApiDeleteRequest;

export interface ChatRequest {
  requestId: string;
  message: string;
  roomId: string;
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
    | "response.cancelled"
    | "error"
    | "cancelled";
  data: unknown;
}

export type DesktopCommand =
  | "new-chat"
  | "command-palette"
  | "settings"
  | "toggle-sidebar"
  | "toggle-inspector";

export interface FileSelection {
  canceled: boolean;
  paths: string[];
}

export interface ProjectResourceSelection extends FileSelection {
  kind: "file" | "folder";
}

export type ManagedAttachmentKind = "audio" | "document" | "image" | "video";

export interface ManagedAttachmentDescriptor {
  id: string;
  name: string;
  kind: ManagedAttachmentKind;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface AttachmentSelection {
  canceled: boolean;
  attachments: ManagedAttachmentDescriptor[];
}

export type SupportedRecordedAudioMime =
  | "audio/mp4"
  | "audio/mpeg"
  | "audio/ogg"
  | "audio/wav"
  | "audio/webm";

export interface RecordedAudioImportRequest {
  bytes: Uint8Array;
  mimeType: SupportedRecordedAudioMime;
  name: string;
}

export interface WorkspaceState {
  currentPath: string;
  recentPaths: string[];
}

export interface DesktopLifecycleState {
  keepRunningInBackground: boolean;
}

export type DesktopUpdatePhase =
  | "unavailable"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "current"
  | "error";
export interface DesktopUpdateState {
  phase: DesktopUpdatePhase;
  message: string;
  version?: string;
  progress?: number;
}

export interface WorkspacePickResult {
  canceled: boolean;
  state: WorkspaceState;
}

export interface DesktopCommandRequest {
  command: string;
  timeoutMs?: number;
}

export interface TerminalStreamRequest extends DesktopCommandRequest {
  requestId: string;
}

export interface TerminalStreamEvent {
  requestId: string;
  event:
    | "terminal.started"
    | "terminal.stdout"
    | "terminal.stderr"
    | "terminal.completed"
    | "terminal.cancelled"
    | "error";
  data: unknown;
}

export type InteractiveTerminalSessionState = "running" | "exited" | "closed";

export interface InteractiveTerminalSession {
  id: string;
  state: InteractiveTerminalSessionState;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  startedAt: string;
  completedAt?: string;
  exitCode?: number;
  pty: boolean;
  supportsResize: boolean;
  outputBytes: number;
}

export interface InteractiveTerminalOutputChunk {
  cursor: number;
  data: string;
}

export interface InteractiveTerminalOutput {
  session: InteractiveTerminalSession;
  chunks: InteractiveTerminalOutputChunk[];
  nextCursor: number;
  truncatedBeforeCursor: boolean;
}

export interface InteractiveTerminalStartRequest {
  cols: number;
  rows: number;
}

export type InteractiveTerminalStartResult =
  | {
      status: "cancelled";
    }
  | {
      status: "started";
      session: InteractiveTerminalSession;
    };

export interface InteractiveTerminalInputRequest {
  sessionId: string;
  data: string;
}

export interface InteractiveTerminalResizeRequest {
  sessionId: string;
  cols: number;
  rows: number;
}

export type DesktopCommandResult =
  | {
      status: "cancelled";
    }
  | {
      status: "completed";
      result: unknown;
    };

export interface WorkspaceFileSaveRequest {
  path: string;
  content: string;
  expectedContent: string;
}

export type WorkspaceFileSaveResult =
  | {
      status: "cancelled";
    }
  | {
      status: "saved";
      path: string;
    }
  | {
      status: "conflict";
      message: string;
    };

export interface RepositoryWorktreeCreateRequest {
  branch: string;
  path: string;
}

export type RepositoryReviewDegradedReason =
  | "not_repository"
  | "git_unavailable"
  | "gh_unavailable"
  | "not_authenticated"
  | "unsupported_remote"
  | "no_pull_request"
  | "network_error"
  | "malformed_response"
  | "timeout";

export interface RepositoryReviewLocalSummary {
  isRepository: boolean;
  root?: string;
  branch?: string;
  head?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  changedFiles: number;
}

export interface RepositoryReviewRemote {
  host: "github.com";
  owner: string;
  name: string;
  slug: string;
  url: string;
}

export interface RepositoryPullRequest {
  number: number;
  title: string;
  state: "open" | "closed" | "merged" | "unknown";
  url: string;
  author?: string;
  isDraft: boolean;
  reviewDecision?: string;
  mergeStateStatus?: string;
  headRefName?: string;
  baseRefName?: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  comments: number;
  reviews: number;
  reviewRequests: string[];
  labels: string[];
  updatedAt?: string;
}

export interface RepositoryReviewCheck {
  name: string;
  status: "queued" | "in_progress" | "completed" | "unknown";
  conclusion?: string;
  url?: string;
  workflow?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RepositoryWorkflowRun {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed" | "unknown";
  conclusion?: string;
  url?: string;
  event?: string;
  headBranch?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RepositoryReview {
  state: "ready" | "degraded";
  local: RepositoryReviewLocalSummary;
  repository?: RepositoryReviewRemote;
  branch?: string;
  pullRequest?: RepositoryPullRequest;
  checks: RepositoryReviewCheck[];
  workflowRuns: RepositoryWorkflowRun[];
  degraded?: {
    reason: RepositoryReviewDegradedReason;
    detail: string;
  };
  fetchedAt: string;
}

export interface RepositoryReviewResponse {
  review: RepositoryReview;
}

export interface RepositoryWorktree {
  path: string;
  head?: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  prunable: boolean;
}

export type RepositoryWorktreeCreateResult =
  | {
      status: "cancelled";
    }
  | {
      status: "created";
      worktree: RepositoryWorktree;
    };

export interface DoolittleDesktopBridge {
  platform: "darwin" | "win32" | "linux";
  getBackendState(): Promise<BackendState>;
  retryBackend(): Promise<BackendState>;
  onBackendState(listener: (state: BackendState) => void): () => void;
  getWorkspaceState(): Promise<WorkspaceState>;
  pickWorkspace(): Promise<WorkspacePickResult>;
  switchWorkspace(path: string): Promise<WorkspacePickResult>;
  onWorkspaceState(listener: (state: WorkspaceState) => void): () => void;
  onAppCommand(listener: (command: DesktopCommand) => void): () => void;
  getLifecycleState(): Promise<DesktopLifecycleState>;
  setKeepRunningInBackground(enabled: boolean): Promise<DesktopLifecycleState>;
  getUpdateState(): Promise<DesktopUpdateState>;
  checkForUpdates(): Promise<DesktopUpdateState>;
  downloadUpdate(): Promise<DesktopUpdateState>;
  installUpdate(): Promise<void>;
  onUpdateState(listener: (state: DesktopUpdateState) => void): () => void;
  pickFiles(): Promise<FileSelection>;
  pickProjectFiles(): Promise<ProjectResourceSelection>;
  pickProjectFolders(): Promise<ProjectResourceSelection>;
  pickChatAttachments(): Promise<AttachmentSelection>;
  importRecordedAudio(
    request: RecordedAudioImportRequest,
  ): Promise<ManagedAttachmentDescriptor>;
  api<T>(request: ApiRequest): Promise<T>;
  runCommand(request: DesktopCommandRequest): Promise<DesktopCommandResult>;
  startTerminalRun(request: TerminalStreamRequest): Promise<void>;
  cancelTerminalRun(requestId: string): Promise<void>;
  onTerminalEvent(listener: (event: TerminalStreamEvent) => void): () => void;
  startInteractiveTerminal(
    request: InteractiveTerminalStartRequest,
  ): Promise<InteractiveTerminalStartResult>;
  writeInteractiveTerminal(
    request: InteractiveTerminalInputRequest,
  ): Promise<InteractiveTerminalSession>;
  resizeInteractiveTerminal(
    request: InteractiveTerminalResizeRequest,
  ): Promise<InteractiveTerminalSession>;
  interruptInteractiveTerminal(
    sessionId: string,
  ): Promise<InteractiveTerminalSession>;
  closeInteractiveTerminal(
    sessionId: string,
  ): Promise<InteractiveTerminalSession>;
  getInteractiveTerminalOutput(
    sessionId: string,
    cursor: number,
  ): Promise<InteractiveTerminalOutput>;
  saveWorkspaceFile(
    request: WorkspaceFileSaveRequest,
  ): Promise<WorkspaceFileSaveResult>;
  createWorktree(
    request: RepositoryWorktreeCreateRequest,
  ): Promise<RepositoryWorktreeCreateResult>;
  startChat(request: ChatRequest): Promise<void>;
  cancelChat(requestId: string): Promise<void>;
  onChatEvent(listener: (event: ChatEvent) => void): () => void;
}
