export type MemoryTarget = "memory" | "user";
export type ExecutionBackendName =
  | "local"
  | "docker"
  | "podman"
  | "ssh"
  | "singularity"
  | "daytona"
  | "modal";
export type ExecutionBackendMode = "local" | "container" | "remote";
export type ExecutionBackendEngine =
  | "docker"
  | "podman"
  | "ssh"
  | "singularity"
  | "daytona"
  | "modal";
export type RemoteWorkspaceSyncMode = "mirror" | "snapshot";
export type RemoteArtifactPolicy = "metadata-only" | "allowlisted";
export type RemoteLifecycleEvent = "preview" | "health" | "run";

export interface EnvConfig {
  agentName: string;
  mode: "api" | "cli" | "both";
  host: string;
  port: number;
  dataDir: string;
  skillsDir: string;
  timezone: string;
  openAiApiKey?: string;
  openAiBaseUrl: string;
  openAiModel: string;
  openAiImageModel?: string;
  openAiTemperature: number;
  openAiMaxTokens: number;
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  anthropicSmallModel: string;
  anthropicLargeModel: string;
  telegramBotToken?: string;
  telegramApiRoot?: string;
  telegramAllowedChats?: string;
  discordBotToken?: string;
  slackWebhookUrl?: string;
  slackSigningSecret?: string;
  whatsappAccessToken?: string;
  whatsappPhoneNumberId?: string;
  whatsappVerifyToken?: string;
  signalCliCommand?: string;
  matrixHomeserver?: string;
  matrixAccessToken?: string;
  emailSendCommand?: string;
  smsSendCommand?: string;
  mattermostUrl?: string;
  mattermostToken?: string;
  homeAssistantUrl?: string;
  homeAssistantToken?: string;
  dingtalkWebhookUrl?: string;
  dingtalkAccessToken?: string;
  browserProvider: "lightpanda" | "basic";
  browserCommand: string;
  browserCdpUrl?: string;
  browserObeyRobots: boolean;
  remoteSyncMode: RemoteWorkspaceSyncMode;
  remoteSyncInclude: string[];
  remoteSyncExclude: string[];
  remoteArtifactPaths: string[];
  remoteArtifactPolicy: RemoteArtifactPolicy;
  remoteWorkspaceLabel: string;
  executionBackend: ExecutionBackendName;
  dockerImage: string;
  dockerNetwork: string;
  dockerWorkspacePath: string;
  dockerEnvPassthrough: string[];
  singularityImage: string;
  daytonaTarget?: string;
  daytonaCommand?: string;
  daytonaShell?: string;
  daytonaWorkspacePath?: string;
  daytonaSnapshot?: string;
  daytonaBootstrapCommand?: string;
  daytonaStatusCommand?: string;
  daytonaInspectCommand?: string;
  modalTarget?: string;
  modalCommand?: string;
  modalShell?: string;
  modalWorkspacePath?: string;
  modalEnvironment?: string;
  modalBootstrapCommand?: string;
  modalStatusCommand?: string;
  modalInspectCommand?: string;
  executionCommandTimeoutMs: number;
  executionHealthTimeoutMs: number;
  containerCpuLimit: string;
  containerMemoryLimit: string;
  containerPidsLimit: number;
  containerReadOnlyRoot: boolean;
  sshHost?: string;
  sshUser?: string;
  sshPath?: string;
  sshPort: number;
  sshKeyPath?: string;
  sshStrictHostKeyChecking: boolean;
  mcpServerCommand?: string;
  mcpTimeoutMs: number;
  memoryCharLimit: number;
  userCharLimit: number;
  sessionSearchLimit: number;
  cronTickSeconds: number;
  cronOutputDir: string;
  gatewayDataDir: string;
  hooksDir: string;
  workspaceDir: string;
  allowAllUsers: boolean;
  pairingDefaultMode: "pair" | "deny" | "allow";
}

export interface SkillDocument {
  slug: string;
  title: string;
  description: string;
  path: string;
  content: string;
}

export interface StoredMessage {
  id: string;
  sessionId: string;
  roomId: string;
  entityId: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
}

export interface SessionSearchResult {
  sessionId: string;
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}

export interface SessionSummary {
  sessionId: string;
  title?: string;
  continuityKey?: string;
  messageCount: number;
  startedAt?: string;
  endedAt?: string;
  participants: Array<"user" | "assistant" | "system">;
  preview: string[];
}

export interface CronJobRuntimeOverrides {
  provider?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  personalityId?: string;
}

export interface CronJobRecord {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  delivery: "origin" | "local" | "home";
  skills: string[];
  runtime?: CronJobRuntimeOverrides;
  status: "active" | "paused";
  oneShot: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRunRecord {
  id: string;
  jobId: string;
  jobName: string;
  output: string;
  outputPath?: string;
  createdAt: string;
}

export interface ChatTurnRequest {
  message: string;
  userId: string;
  roomId?: string;
  source?: string;
}

export interface FeatureMapping {
  platformCapability: string;
  elizaImplementation: string;
  notes: string;
}

export type PlatformName =
  | "api"
  | "cli"
  | "telegram"
  | "discord"
  | "slack"
  | "whatsapp"
  | "signal"
  | "matrix"
  | "email"
  | "sms"
  | "mattermost"
  | "homeassistant"
  | "dingtalk";

export interface GatewayPlatformConfig {
  enabled: boolean;
  allowAllUsers?: boolean;
  allowedUserIds: string[];
  homeChannel?: string;
  pairingMode?: "pair" | "deny" | "allow";
}

export interface GatewayConfig {
  allowAllUsers: boolean;
  sessionTimeoutMinutes: number;
  mirrorResponsesToHistory: boolean;
  platforms: Record<PlatformName, GatewayPlatformConfig>;
}

export interface PairingRequestRecord {
  id: string;
  platform: PlatformName;
  userId: string;
  code: string;
  createdAt: string;
  approvedAt?: string;
  deniedAt?: string;
  status: "pending" | "approved" | "denied";
}

export interface PairingAllowlistEntry {
  platform: PlatformName;
  userId: string;
  approvedAt: string;
}

export interface IncomingPlatformMessage {
  platform: PlatformName;
  userId: string;
  roomId: string;
  text: string;
  channelId?: string;
  threadId?: string;
  messageId?: string;
  replyToMessageId?: string;
  channelType?: string;
  authorName?: string;
  timestamp?: string;
  metadata?: Record<string, string>;
}

export interface SessionRoute {
  sessionKey: string;
  roomId: string;
  userId: string;
  platform: PlatformName;
  channelId?: string;
  threadId?: string;
  messageId?: string;
  replyToMessageId?: string;
  channelType?: string;
  authorName?: string;
  metadata?: Record<string, string>;
  voiceMode?: "off" | "voice_only" | "all";
  voiceChannelId?: string;
  voiceChannelState?: "disconnected" | "connected";
  voiceUpdatedAt?: string;
  voiceUpdatedReason?: string;
  isHome?: boolean;
  homeLabel?: string;
  homeUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryTarget {
  platform: PlatformName;
  channelId?: string;
  userId?: string;
  mode: "origin" | "home" | "explicit" | "local";
}

export interface OutboundPlatformMessage {
  roomId: string;
  userId?: string;
  text: string;
  threadId?: string;
  replyToId?: string;
  metadata?: Record<string, string>;
}

export interface DeliveredMessageRecord {
  id: string;
  target: DeliveryTarget;
  text: string;
  threadId?: string;
  replyToId?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt?: string;
  editOfId?: string;
  editCount?: number;
}

export interface HookDefinition {
  id: string;
  event: string;
  name: string;
  enabled: boolean;
  template: string;
}

export interface HookInvocation {
  hookId: string;
  event: string;
  payload: Record<string, unknown>;
  rendered: string;
  createdAt: string;
}

export interface PersonalityProfile {
  id: string;
  name: string;
  description: string;
  systemAddendum: string;
}

export interface UserProfileRecord {
  userId: string;
  displayName?: string;
  memoryMode?: "local" | "hybrid";
  preferences: string[];
  facts: string[];
  notes: string[];
  aliases?: string[];
  goals?: string[];
  projectContext?: string[];
  constraints?: string[];
  explicitMemories?: string[];
  toolPreferences?: string[];
  workStyle?: string[];
  lastSource?: string;
  lastSeenAt: string;
  updatedAt: string;
}

export interface AgentIdentityRecord {
  name: string;
  notes: string[];
  goals: string[];
  strengths: string[];
  workStyle: string[];
  lastSource?: string;
  updatedAt: string;
}

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

export interface TerminalCommandRecord {
  id: string;
  command: string;
  backend: ExecutionBackendName;
  backendMode?: ExecutionBackendMode;
  backendEngine?: ExecutionBackendEngine;
  target?: string;
  cloud?: ExecutionCloudProfile;
  cloudSession?: ExecutionCloudSession;
  executionTarget?: string;
  executionSessionId?: string;
  executionProfile?: ExecutionCloudProfile;
  cwd: string;
  timeoutMs?: number;
  timedOut?: boolean;
  durationMs?: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  preview?: ExecutionBackendPreview;
  cloudSnapshot?: ExecutionCloudSnapshotRecord;
  cloudArtifacts?: ExecutionRemoteArtifactRecord[];
  cloudSyncPlan?: ExecutionRemoteSyncPlan;
}

export interface DiagnosticCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  summary: string;
  detail: string;
}

export interface ExecutionBackendHealth {
  backend: ExecutionBackendName;
  mode: ExecutionBackendMode;
  engine?: ExecutionBackendEngine;
  target?: string;
  cloud?: ExecutionCloudProfile;
  cloudSession?: ExecutionCloudSession;
  cloudSnapshot?: ExecutionCloudSnapshotRecord;
  cloudArtifacts?: ExecutionRemoteArtifactRecord[];
  cloudSyncPlan?: ExecutionRemoteSyncPlan;
  ready: boolean;
  detail: string;
  limits: ExecutionBackendLimits;
  diagnostics: string[];
  checks: DiagnosticCheck[];
  bootstrap: string[];
}

export interface ExecutionBackendPreview {
  backend: ExecutionBackendName;
  mode: ExecutionBackendMode;
  engine?: ExecutionBackendEngine;
  target?: string;
  cloud?: ExecutionCloudProfile;
  cloudSession?: ExecutionCloudSession;
  cloudSnapshot?: ExecutionCloudSnapshotRecord;
  cloudArtifacts?: ExecutionRemoteArtifactRecord[];
  cloudSyncPlan?: ExecutionRemoteSyncPlan;
  ready: boolean;
  detail: string;
  cwd: string;
  timeoutMs: number;
  command: string;
  argv: string[];
  diagnostics: string[];
  checks: DiagnosticCheck[];
  bootstrap: string[];
}

export interface ExecutionBackendLimits {
  commandTimeoutMs: number;
  healthTimeoutMs: number;
  containerCpuLimit: string;
  containerMemoryLimit: string;
  containerPidsLimit: number;
  containerReadOnlyRoot: boolean;
}

export interface ExecutionCloudProfile {
  provider: "daytona" | "modal";
  target: string;
  shell: string;
  workspacePath: string;
  state: "persistent-sandbox" | "interactive-shell";
  commandStyle: "exec" | "shell";
  envPassthrough: string[];
  workspaceLabel: string;
  syncPlan: ExecutionRemoteSyncPlan;
  artifactPolicy: RemoteArtifactPolicy;
  artifactPaths: string[];
  snapshot?: string;
  environment?: string;
  bootstrapCommand?: string;
  statusCommand?: string;
  inspectCommand?: string;
}

export interface ExecutionRemoteSyncPlan {
  mode: RemoteWorkspaceSyncMode;
  localWorkspacePath: string;
  remoteWorkspacePath: string;
  workspaceLabel: string;
  include: string[];
  exclude: string[];
  artifactPaths: string[];
  artifactPolicy: RemoteArtifactPolicy;
  safetyNotes: string[];
  generatedAt: string;
}

export interface ExecutionRemoteArtifactRecord {
  artifactId: string;
  provider: "daytona" | "modal";
  target: string;
  workspaceLabel: string;
  path: string;
  kind: "manifest" | "checkpoint" | "report";
  status: "planned" | "available" | "missing";
  detail: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionCloudArtifactRecord
  extends ExecutionRemoteArtifactRecord {}

export interface ExecutionCloudSnapshotRecord {
  snapshotId: string;
  provider: "daytona" | "modal";
  target: string;
  workspaceLabel: string;
  event: RemoteLifecycleEvent;
  state: "planned" | "idle" | "ready" | "running" | "failed";
  summary: string;
  commandId?: string;
  command?: string;
  cwd: string;
  workspacePath: string;
  syncPlan: ExecutionRemoteSyncPlan;
  artifacts: ExecutionRemoteArtifactRecord[];
  createdAt: string;
  updatedAt: string;
  lastExitCode?: number;
  lastStdout?: string;
  lastStderr?: string;
}

export interface ExecutionCloudSession {
  sessionId: string;
  provider: "daytona" | "modal";
  target: string;
  profile: ExecutionCloudProfile;
  state: "planned" | "idle" | "ready" | "running" | "failed";
  syncState: "planned" | "synced" | "stale" | "error";
  workspaceLabel: string;
  createdAt: string;
  updatedAt: string;
  lastHealthAt?: string;
  lastPreviewAt?: string;
  lastRunAt?: string;
  lastCommandId?: string;
  lastCommand?: string;
  lastExitCode?: number;
  lastStdout?: string;
  lastStderr?: string;
  lastSnapshotAt?: string;
  lastSnapshotId?: string;
  lastSnapshotSummary?: string;
  snapshotCount: number;
  artifactCount: number;
  syncPlan: ExecutionRemoteSyncPlan;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToolDefinition {
  id: string;
  name: string;
  category:
    | "workspace"
    | "terminal"
    | "repository"
    | "documents"
    | "gateway"
    | "automation"
    | "mcp";
  description: string;
  enabled: boolean;
  transport?: "native" | "service" | "adapter";
}

export interface DelegationTaskRecord {
  id: string;
  title: string;
  objective: string;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, string>;
  parentTaskId?: string;
  childTaskIds?: string[];
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  executionMode: "local" | "delegated";
  workerMode?: "inline" | "process";
  workerPid?: number;
  attempts?: number;
  maxAttempts?: number;
  startedAt?: string;
  lastOutputPath?: string;
  notes: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
