export type MemoryTarget = "memory" | "user";
export type ExecutionBackendName = "local" | "docker" | "podman" | "ssh";
export type ExecutionBackendMode = "local" | "container" | "remote";

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
  browserProvider: "lightpanda" | "basic";
  browserCommand: string;
  browserCdpUrl?: string;
  browserObeyRobots: boolean;
  executionBackend: ExecutionBackendName;
  dockerImage: string;
  dockerNetwork: string;
  dockerWorkspacePath: string;
  dockerEnvPassthrough: string[];
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
  messageCount: number;
  startedAt?: string;
  endedAt?: string;
  participants: Array<"user" | "assistant" | "system">;
  preview: string[];
}

export interface CronJobRecord {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  delivery: "origin" | "local";
  skills: string[];
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
  | "sms";

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
  preferences: string[];
  facts: string[];
  notes: string[];
  lastSource?: string;
  lastSeenAt: string;
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
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
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
  engine?: "docker" | "podman" | "ssh";
  ready: boolean;
  detail: string;
  limits: ExecutionBackendLimits;
}

export interface ExecutionBackendLimits {
  commandTimeoutMs: number;
  healthTimeoutMs: number;
  containerCpuLimit: string;
  containerMemoryLimit: string;
  containerPidsLimit: number;
  containerReadOnlyRoot: boolean;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToolDefinition {
  id: string;
  name: string;
  category: "workspace" | "terminal" | "repository" | "documents" | "gateway" | "automation" | "mcp";
  description: string;
  enabled: boolean;
  transport?: "native" | "service" | "adapter";
}

export interface DelegationTaskRecord {
  id: string;
  title: string;
  objective: string;
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
