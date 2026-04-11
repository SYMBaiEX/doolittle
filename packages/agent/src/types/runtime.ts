import type {
  ExecutionBackendName,
  RemoteArtifactPolicy,
  RemoteWorkspaceSyncMode,
} from "./execution";

export type MemoryTarget = "memory" | "user";
export type RunDepth = "quick" | "standard" | "deep" | "explore";
export type ToolProgressMode = "off" | "new" | "all" | "verbose";
export type DelegationOrchestrationMode =
  | "sequential"
  | "parallel"
  | "hierarchical";

export const RUN_DEPTH_ITERATION_PRESETS: Record<RunDepth, number> = {
  quick: 15,
  standard: 45,
  deep: 90,
  explore: 150,
};

export interface EnvConfig {
  agentName: string;
  mode: "api" | "cli" | "both";
  host: string;
  port: number;
  dataDir: string;
  skillsDir: string;
  timezone: string;
  elizaCloudApiKey?: string;
  elizaCloudEnabled: boolean;
  elizaCloudBaseUrl: string;
  elizaCloudSmallModel: string;
  elizaCloudLargeModel: string;
  elizaCloudEmbeddingModel: string;
  elizaCloudEmbeddingUrl?: string;
  elizaCloudEmbeddingApiKey?: string;
  elizaCloudEmbeddingDimensions?: number;
  openAiApiKey?: string;
  offlineBootstrapMode: boolean;
  useLinkedCodexAuth: boolean;
  openAiBaseUrl: string;
  openAiModel: string;
  openAiImageModel?: string;
  openAiTemperature: number;
  openAiMaxTokens: number;
  anthropicApiKey?: string;
  useLinkedClaudeCodeAuth: boolean;
  claudeCodeCliFallback: boolean;
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
  falApiKey?: string;
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
  acpServerCommand?: string;
  acpTimeoutMs: number;
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
  runDepth: RunDepth;
  toolProgressMode: ToolProgressMode;
  maxIterations: number;
}

export interface SkillDocument {
  slug: string;
  title: string;
  description: string;
  path: string;
  content: string;
  source?: "workspace" | "generated" | "bundled" | "managed" | "project";
  commandName?: string;
  userInvocable?: boolean;
  disableModelInvocation?: boolean;
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
