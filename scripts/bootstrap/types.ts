import type { TuiThemeName } from "../../packages/agent/src/runtime/theme-catalog";
import type {
  RunDepth,
  ToolProgressMode,
} from "../../packages/agent/src/types";

export type ExecutionBackendName =
  | "local"
  | "docker"
  | "podman"
  | "ssh"
  | "singularity"
  | "daytona"
  | "modal";

export type PairingMode = "pair" | "allow" | "deny";

export type WizardMode = "quick" | "ritual";

export type ProviderMode =
  | "elizacloud"
  | "openai"
  | "anthropic"
  | "codex"
  | "claude-code"
  | "hybrid"
  | "offline";

export type BrowserMode = "lightpanda" | "basic";

export type TransportName =
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

export interface RuntimeSettings {
  model: {
    provider: string;
    model: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
  };
  gateway: {
    sessionTimeoutMinutes: number;
    mirrorResponsesToHistory: boolean;
  };
  execution: {
    backend: ExecutionBackendName;
    remoteSyncMode: "mirror" | "snapshot";
    remoteSyncInclude: string[];
    remoteSyncExclude: string[];
    remoteArtifactPaths: string[];
    remoteArtifactPolicy: "metadata-only" | "allowlisted";
    remoteWorkspaceLabel: string;
    dockerImage: string;
    dockerNetwork: string;
    dockerWorkspacePath: string;
    dockerEnvPassthrough: string[];
    singularityImage: string;
    daytonaTarget: string;
    daytonaCommand: string;
    daytonaShell: string;
    daytonaWorkspacePath: string;
    daytonaSnapshot: string;
    daytonaBootstrapCommand: string;
    daytonaStatusCommand: string;
    daytonaInspectCommand: string;
    modalTarget: string;
    modalCommand: string;
    modalShell: string;
    modalWorkspacePath: string;
    modalEnvironment: string;
    modalBootstrapCommand: string;
    modalStatusCommand: string;
    modalInspectCommand: string;
    commandTimeoutMs: number;
    healthTimeoutMs: number;
    containerCpuLimit: string;
    containerMemoryLimit: string;
    containerPidsLimit: number;
    containerReadOnlyRoot: boolean;
    sshHost: string;
    sshUser: string;
    sshPath: string;
    sshPort: number;
    sshKeyPath: string;
    sshStrictHostKeyChecking: boolean;
  };
  mcp: {
    serverCommand: string;
    timeoutMs: number;
  };
  agent: {
    runDepth: RunDepth;
    maxIterations: number;
    toolProgressMode: ToolProgressMode;
  };
  ui: {
    theme: TuiThemeName;
  };
}

export interface GatewayPlatformConfig {
  enabled: boolean;
  allowedUserIds: string[];
  pairingMode: PairingMode;
  allowAllUsers?: boolean;
}

export interface GatewayConfig {
  allowAllUsers: boolean;
  sessionTimeoutMinutes: number;
  mirrorResponsesToHistory: boolean;
  platforms: Record<string, GatewayPlatformConfig>;
}

export interface OnboardingSummary {
  timestamp: string;
  mode: WizardMode | "headless";
  theme: TuiThemeName;
  provider: ProviderMode;
  accounts: {
    elizaCloudLinked: boolean;
    codexLinked: boolean;
    claudeCodeLinked: boolean;
  };
  backend: ExecutionBackendName;
  browser: BrowserMode;
  agent: {
    runDepth: RunDepth;
    maxIterations: number;
    toolProgressMode: ToolProgressMode;
  };
  transports: TransportName[];
  tools: {
    mcp: boolean;
    acp: boolean;
    tts: boolean;
    codegen: boolean;
  };
  nativeOnboarding: {
    complete: boolean;
    currentStep: string;
    summary: string;
  };
  nativeConnection: {
    kind: string;
    provider: string | null;
    detail: string;
  };
  profile: string;
}

export interface BootstrapOptions {
  checkOnly: boolean;
  headless: boolean;
  skipWizard: boolean;
  yes: boolean;
}

export interface BootstrapDependencyProbe {
  key: string;
  label: string;
  installed: boolean;
  detail: string;
  recommendation?: string;
}

export interface WizardAnswers {
  mode: WizardMode;
  agentName: string;
  timezone: string;
  theme: TuiThemeName;
  provider: ProviderMode;
  backend: ExecutionBackendName;
  browser: BrowserMode;
  runDepth: RunDepth;
  maxIterations: number;
  toolProgressMode: ToolProgressMode;
  pairingMode: PairingMode;
  allowAllUsers: boolean;
  transports: TransportName[];
  tools: {
    mcp: boolean;
    acp: boolean;
    tts: boolean;
    codegen: boolean;
  };
  openaiApiKey: string;
  useLinkedCodexAuth: boolean;
  openaiModel: string;
  elizaCloudApiKey: string;
  elizaCloudEnabled: boolean;
  elizaCloudSmallModel: string;
  elizaCloudModel: string;
  elizaCloudEmbeddingModel: string;
  anthropicApiKey: string;
  useLinkedClaudeCodeAuth: boolean;
  claudeCodeCliFallback: boolean;
  claudeCodeOauthToken: string;
  anthropicModel: string;
  telegramBotToken: string;
  discordBotToken: string;
  slackWebhookUrl: string;
  slackSigningSecret: string;
  homeAssistantUrl: string;
  homeAssistantToken: string;
  mcpServerCommand: string;
  acpServerCommand: string;
  falApiKey: string;
  e2bApiKey: string;
  githubToken: string;
  sshHost: string;
  sshUser: string;
  sshPath: string;
  daytonaTarget: string;
  modalTarget: string;
}

export interface ReviewResult {
  answers: WizardAnswers;
  notices: string[];
}
