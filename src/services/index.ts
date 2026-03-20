import { join } from "node:path";
import { loadGatewayConfig } from "@/config/gateway";
import type { EnvConfig } from "@/types";
import { ContextFilesService } from "./context-files-service";
import { CronService } from "./cron-service";
import { DeliveryService } from "./delivery-service";
import { DelegationService } from "./delegation-service";
import { DiagnosticsService } from "./diagnostics-service";
import { DocumentsService } from "./documents-service";
import { GatewaySessionService } from "./gateway-session-service";
import { HooksService } from "./hooks-service";
import { MediaService } from "./media-service";
import { MemoryService } from "./memory-service";
import { McpService } from "./mcp-service";
import { PairingService } from "./pairing-service";
import { PersonalityService } from "./personality-service";
import { RepositoryService } from "./repository-service";
import { SessionService } from "./session-service";
import { SettingsService } from "./settings-service";
import { SkillsService } from "./skills-service";
import { TerminalService } from "./terminal-service";
import { TrajectoryService } from "./trajectory-service";
import { ToolsService } from "./tools-service";
import { WebService } from "./web-service";
import { WorkspaceService } from "./workspace-service";
import { SkillSynthesisService } from "./skill-synthesis-service";
import { UserProfileService } from "./user-profile-service";

export interface AppServices {
  memory: MemoryService;
  skills: SkillsService;
  sessions: SessionService;
  cron: CronService;
  pairing: PairingService;
  hooks: HooksService;
  gatewaySessions: GatewaySessionService;
  delivery: DeliveryService;
  documents: DocumentsService;
  gatewayConfig: ReturnType<typeof loadGatewayConfig>;
  personalities: PersonalityService;
  contextFiles: ContextFilesService;
  settings: SettingsService;
  workspace: WorkspaceService;
  terminal: TerminalService;
  repository: RepositoryService;
  diagnostics: DiagnosticsService;
  tools: ToolsService;
  mcp: McpService;
  delegation: DelegationService;
  web: WebService;
  media: MediaService;
  trajectories: TrajectoryService;
  skillSynthesis: SkillSynthesisService;
  userProfiles: UserProfileService;
}

export function createServices(
  config: EnvConfig,
  runtime?: ConstructorParameters<typeof DocumentsService>[0],
): AppServices {
  const gatewayConfig = loadGatewayConfig(config);
  const provider = config.anthropicApiKey
    ? "anthropic"
    : config.openAiApiKey
      ? "openai"
      : "offline";
  const defaultModel =
    provider === "anthropic" ? config.anthropicLargeModel : config.openAiModel;
  const defaultBaseUrl =
    provider === "anthropic"
      ? (config.anthropicBaseUrl ?? "https://api.anthropic.com")
      : config.openAiBaseUrl;
  const settings = new SettingsService(config.dataDir, {
    model: {
      provider,
      model: defaultModel,
      baseUrl: defaultBaseUrl,
      temperature: config.openAiTemperature,
      maxTokens: config.openAiMaxTokens,
    },
    gateway: {
      sessionTimeoutMinutes: 120,
      mirrorResponsesToHistory: true,
    },
    execution: {
      backend: config.executionBackend,
      dockerImage: config.dockerImage,
      dockerNetwork: config.dockerNetwork,
      dockerWorkspacePath: config.dockerWorkspacePath,
      dockerEnvPassthrough: config.dockerEnvPassthrough,
      commandTimeoutMs: config.executionCommandTimeoutMs,
      healthTimeoutMs: config.executionHealthTimeoutMs,
      containerCpuLimit: config.containerCpuLimit,
      containerMemoryLimit: config.containerMemoryLimit,
      containerPidsLimit: config.containerPidsLimit,
      containerReadOnlyRoot: config.containerReadOnlyRoot,
      sshHost: config.sshHost ?? "",
      sshUser: config.sshUser ?? "",
      sshPath: config.sshPath ?? "",
      sshPort: config.sshPort,
      sshKeyPath: config.sshKeyPath ?? "",
      sshStrictHostKeyChecking: config.sshStrictHostKeyChecking,
    },
    mcp: {
      serverCommand: config.mcpServerCommand ?? "",
      timeoutMs: config.mcpTimeoutMs,
    },
  });
  const currentSettings = settings.get();
  if (!currentSettings.execution.dockerNetwork) {
    settings.set("execution.dockerNetwork", config.dockerNetwork);
  }
  if (!currentSettings.execution.dockerWorkspacePath) {
    settings.set("execution.dockerWorkspacePath", config.dockerWorkspacePath);
  }
  if (!currentSettings.execution.dockerEnvPassthrough?.length && config.dockerEnvPassthrough.length) {
    settings.set("execution.dockerEnvPassthrough", config.dockerEnvPassthrough);
  }
  if (!currentSettings.execution.sshPort) {
    settings.set("execution.sshPort", config.sshPort);
  }
  if (!currentSettings.execution.sshKeyPath && config.sshKeyPath) {
    settings.set("execution.sshKeyPath", config.sshKeyPath);
  }
  if (!currentSettings.execution.sshStrictHostKeyChecking && config.sshStrictHostKeyChecking) {
    settings.set("execution.sshStrictHostKeyChecking", config.sshStrictHostKeyChecking);
  }
  if (!currentSettings.mcp.serverCommand && config.mcpServerCommand) {
    settings.set("mcp.serverCommand", config.mcpServerCommand);
  }
  if (!currentSettings.mcp.timeoutMs && config.mcpTimeoutMs) {
    settings.set("mcp.timeoutMs", config.mcpTimeoutMs);
  }
  const sessions = new SessionService(config.dataDir);
  const mcp = new McpService(() => settings.get().mcp);
  const tools = new ToolsService(() => ({
    mcpEnabled: mcp.status().enabled,
    discoveredMcpTools: mcp.getCachedTools().length,
  }));

  return {
    memory: new MemoryService(config.dataDir, {
      memory: config.memoryCharLimit,
      user: config.userCharLimit,
    }),
    skills: new SkillsService(config.skillsDir),
    sessions,
    cron: new CronService(
      join(config.dataDir, "cron"),
      config.cronOutputDir,
      config.cronTickSeconds,
    ),
    pairing: new PairingService(join(config.gatewayDataDir, "pairing")),
    hooks: new HooksService(config.hooksDir),
    gatewaySessions: new GatewaySessionService(join(config.gatewayDataDir, "sessions")),
    delivery: new DeliveryService(join(config.gatewayDataDir, "delivery")),
    documents: new DocumentsService(
      runtime ?? ({} as ConstructorParameters<typeof DocumentsService>[0]),
      config.workspaceDir,
    ),
    gatewayConfig,
    personalities: new PersonalityService(config.dataDir),
    contextFiles: new ContextFilesService(config.workspaceDir),
    workspace: new WorkspaceService(config.workspaceDir),
    terminal: new TerminalService(join(config.dataDir, "terminal"), config.workspaceDir, () =>
      settings.get(),
    ),
    repository: new RepositoryService(config.workspaceDir),
    diagnostics: new DiagnosticsService(config, gatewayConfig),
    tools,
    mcp,
    delegation: new DelegationService(join(config.dataDir, "delegation")),
    web: new WebService(
      () => ({
        provider: config.browserProvider,
        command: config.browserCommand,
        cdpUrl: config.browserCdpUrl,
        obeyRobots: config.browserObeyRobots,
      }),
      join(config.dataDir, "web"),
    ),
    media: new MediaService(config.workspaceDir),
    trajectories: new TrajectoryService(join(config.dataDir, "trajectories"), sessions),
    skillSynthesis: new SkillSynthesisService(config.skillsDir),
    userProfiles: new UserProfileService(join(config.dataDir, "profiles")),
    settings,
  };
}
