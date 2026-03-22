import { join } from "node:path";
import { loadGatewayConfig } from "@/config/gateway";
import { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { EnvConfig } from "@/types";
import { AcpService } from "./acp-service";
import { AgentSdkService } from "./agent-sdk-service";
import { ApiTransportService } from "./api-transport-service";
import { AutocoderPipelineService } from "./autocoder-pipeline-service";
import { ContextFilesService } from "./context-files-service";
import { CronService } from "./cron-service";
import { DelegationService } from "./delegation-service";
import { DeliveryService } from "./delivery-service";
import { DiagnosticsService } from "./diagnostics-service";
import { DocumentsService } from "./documents-service";
import { EcosystemService } from "./ecosystem-service";
import { ExecutionApprovalService } from "./execution-approval-service";
import { GatewaySessionService } from "./gateway-session-service";
import { HooksService } from "./hooks-service";
import { McpService } from "./mcp-service";
import { MediaService } from "./media-service";
import { MemoryService } from "./memory-service";
import {
  createNativeServiceRegistry,
  type NativeServiceRegistry,
} from "./native-service-registry";
import { OperatorService } from "./operator-service";
import { PairingService } from "./pairing-service";
import { PersonalityService } from "./personality-service";
import { RepositoryService } from "./repository-service";
import { SessionService } from "./session-service";
import { SettingsService } from "./settings-service";
import { SkillSynthesisService } from "./skill-synthesis-service";
import { SkillsHubService } from "./skills-hub-service";
import { SkillsService } from "./skills-service";
import { TerminalService } from "./terminal-service";
import { ToolsService } from "./tools-service";
import { TrajectoryService } from "./trajectory-service";
import { UserProfileService } from "./user-profile-service";
import { WebService } from "./web-service";
import { WorkspaceService } from "./workspace-service";

export interface AppServices {
  apiTransport: ApiTransportService;
  agentSdk: AgentSdkService;
  nativeRegistry: NativeServiceRegistry;
  nativeOwnership: NativeOwnershipCache;
  memory: MemoryService;
  skills: SkillsService;
  skillsHub: SkillsHubService;
  sessions: SessionService;
  cron: CronService;
  pairing: PairingService;
  hooks: HooksService;
  gatewaySessions: GatewaySessionService;
  executionApprovals: ExecutionApprovalService;
  delivery: DeliveryService;
  documents: DocumentsService;
  ecosystem: EcosystemService;
  gatewayConfig: ReturnType<typeof loadGatewayConfig>;
  personalities: PersonalityService;
  contextFiles: ContextFilesService;
  settings: SettingsService;
  workspace: WorkspaceService;
  terminal: TerminalService;
  repository: RepositoryService;
  diagnostics: DiagnosticsService;
  operator: OperatorService;
  tools: ToolsService;
  mcp: McpService;
  acp: AcpService;
  autocoderPipeline: AutocoderPipelineService;
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
  const agentSdk = new AgentSdkService();
  const nativeOwnership = new NativeOwnershipCache(config, gatewayConfig);
  const provider: "anthropic" | "openai" | "codex" | "claude-code" | "offline" =
    config.anthropicApiKey
      ? "anthropic"
      : config.openAiApiKey
        ? "openai"
        : config.useLinkedClaudeCodeAuth
          ? "claude-code"
          : config.useLinkedCodexAuth
            ? "codex"
            : "offline";
  const defaultModel =
    provider === "anthropic" || provider === "claude-code"
      ? config.anthropicLargeModel
      : config.openAiModel;
  const defaultBaseUrl =
    provider === "anthropic" || provider === "claude-code"
      ? (config.anthropicBaseUrl ?? "https://api.anthropic.com")
      : provider === "codex"
        ? "https://chatgpt.com/backend-api/codex"
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
      remoteSyncMode: config.remoteSyncMode,
      remoteSyncInclude: config.remoteSyncInclude,
      remoteSyncExclude: config.remoteSyncExclude,
      remoteArtifactPaths: config.remoteArtifactPaths,
      remoteArtifactPolicy: config.remoteArtifactPolicy,
      remoteWorkspaceLabel: config.remoteWorkspaceLabel,
      dockerImage: config.dockerImage,
      dockerNetwork: config.dockerNetwork,
      dockerWorkspacePath: config.dockerWorkspacePath,
      dockerEnvPassthrough: config.dockerEnvPassthrough,
      singularityImage: config.singularityImage,
      daytonaTarget: config.daytonaTarget ?? "",
      daytonaCommand: config.daytonaCommand ?? "",
      daytonaShell: config.daytonaShell ?? "/bin/sh",
      daytonaWorkspacePath: config.daytonaWorkspacePath ?? "/workspace",
      daytonaSnapshot: config.daytonaSnapshot ?? "",
      daytonaBootstrapCommand: config.daytonaBootstrapCommand ?? "",
      daytonaStatusCommand: config.daytonaStatusCommand ?? "",
      daytonaInspectCommand: config.daytonaInspectCommand ?? "",
      modalTarget: config.modalTarget ?? "",
      modalCommand: config.modalCommand ?? "",
      modalShell: config.modalShell ?? "/bin/bash",
      modalWorkspacePath: config.modalWorkspacePath ?? "/workspace",
      modalEnvironment: config.modalEnvironment ?? "",
      modalBootstrapCommand: config.modalBootstrapCommand ?? "",
      modalStatusCommand: config.modalStatusCommand ?? "",
      modalInspectCommand: config.modalInspectCommand ?? "",
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
    ui: {
      theme: "orange",
    },
  });
  const linkedAccounts = getLinkedProviderAccountsSnapshot();
  const currentSettings = settings.get();
  const persistedProvider = currentSettings.model.provider;
  const persistedHasOpenAi =
    persistedProvider === "openai" && Boolean(config.openAiApiKey?.trim());
  const persistedHasAnthropic =
    persistedProvider === "anthropic" &&
    Boolean(config.anthropicApiKey?.trim());
  const persistedHasCodex =
    persistedProvider === "codex" &&
    Boolean(linkedAccounts.codex.nativeReady || linkedAccounts.codex.reusable);
  const persistedHasClaudeCode =
    persistedProvider === "claude-code" &&
    Boolean(
      linkedAccounts.claudeCode.nativeReady ||
        linkedAccounts.claudeCode.reusable,
    );

  if (
    !persistedHasOpenAi &&
    !persistedHasAnthropic &&
    !persistedHasCodex &&
    !persistedHasClaudeCode
  ) {
    if (linkedAccounts.codex.nativeReady || linkedAccounts.codex.reusable) {
      settings.set("model.provider", "codex");
      settings.set("model.model", "gpt-5.4");
      settings.set("model.baseUrl", "https://chatgpt.com/backend-api/codex");
    } else if (
      linkedAccounts.claudeCode.nativeReady ||
      linkedAccounts.claudeCode.reusable
    ) {
      settings.set("model.provider", "claude-code");
      settings.set("model.model", config.anthropicLargeModel);
      settings.set("model.baseUrl", config.anthropicBaseUrl ?? "");
    }
  }

  if (!currentSettings.execution.dockerNetwork) {
    settings.set("execution.dockerNetwork", config.dockerNetwork);
  }
  if (!currentSettings.execution.remoteSyncMode) {
    settings.set("execution.remoteSyncMode", config.remoteSyncMode);
  }
  if (
    !currentSettings.execution.remoteSyncInclude?.length &&
    config.remoteSyncInclude.length
  ) {
    settings.set("execution.remoteSyncInclude", config.remoteSyncInclude);
  }
  if (
    !currentSettings.execution.remoteSyncExclude?.length &&
    config.remoteSyncExclude.length
  ) {
    settings.set("execution.remoteSyncExclude", config.remoteSyncExclude);
  }
  if (
    !currentSettings.execution.remoteArtifactPaths?.length &&
    config.remoteArtifactPaths.length
  ) {
    settings.set("execution.remoteArtifactPaths", config.remoteArtifactPaths);
  }
  if (!currentSettings.execution.remoteArtifactPolicy) {
    settings.set("execution.remoteArtifactPolicy", config.remoteArtifactPolicy);
  }
  if (!currentSettings.execution.remoteWorkspaceLabel) {
    settings.set("execution.remoteWorkspaceLabel", config.remoteWorkspaceLabel);
  }
  if (!currentSettings.execution.dockerWorkspacePath) {
    settings.set("execution.dockerWorkspacePath", config.dockerWorkspacePath);
  }
  if (
    !currentSettings.execution.dockerEnvPassthrough?.length &&
    config.dockerEnvPassthrough.length
  ) {
    settings.set("execution.dockerEnvPassthrough", config.dockerEnvPassthrough);
  }
  if (!currentSettings.execution.singularityImage && config.singularityImage) {
    settings.set("execution.singularityImage", config.singularityImage);
  }
  if (!currentSettings.execution.daytonaTarget && config.daytonaTarget) {
    settings.set("execution.daytonaTarget", config.daytonaTarget);
  }
  if (!currentSettings.execution.daytonaCommand && config.daytonaCommand) {
    settings.set("execution.daytonaCommand", config.daytonaCommand);
  }
  if (!currentSettings.execution.daytonaShell && config.daytonaShell) {
    settings.set("execution.daytonaShell", config.daytonaShell);
  }
  if (
    !currentSettings.execution.daytonaWorkspacePath &&
    config.daytonaWorkspacePath
  ) {
    settings.set("execution.daytonaWorkspacePath", config.daytonaWorkspacePath);
  }
  if (!currentSettings.execution.daytonaSnapshot && config.daytonaSnapshot) {
    settings.set("execution.daytonaSnapshot", config.daytonaSnapshot);
  }
  if (
    !currentSettings.execution.daytonaBootstrapCommand &&
    config.daytonaBootstrapCommand
  ) {
    settings.set(
      "execution.daytonaBootstrapCommand",
      config.daytonaBootstrapCommand,
    );
  }
  if (
    !currentSettings.execution.daytonaStatusCommand &&
    config.daytonaStatusCommand
  ) {
    settings.set("execution.daytonaStatusCommand", config.daytonaStatusCommand);
  }
  if (
    !currentSettings.execution.daytonaInspectCommand &&
    config.daytonaInspectCommand
  ) {
    settings.set(
      "execution.daytonaInspectCommand",
      config.daytonaInspectCommand,
    );
  }
  if (!currentSettings.execution.modalTarget && config.modalTarget) {
    settings.set("execution.modalTarget", config.modalTarget);
  }
  if (!currentSettings.execution.modalCommand && config.modalCommand) {
    settings.set("execution.modalCommand", config.modalCommand);
  }
  if (!currentSettings.execution.modalShell && config.modalShell) {
    settings.set("execution.modalShell", config.modalShell);
  }
  if (
    !currentSettings.execution.modalWorkspacePath &&
    config.modalWorkspacePath
  ) {
    settings.set("execution.modalWorkspacePath", config.modalWorkspacePath);
  }
  if (!currentSettings.execution.modalEnvironment && config.modalEnvironment) {
    settings.set("execution.modalEnvironment", config.modalEnvironment);
  }
  if (
    !currentSettings.execution.modalBootstrapCommand &&
    config.modalBootstrapCommand
  ) {
    settings.set(
      "execution.modalBootstrapCommand",
      config.modalBootstrapCommand,
    );
  }
  if (
    !currentSettings.execution.modalStatusCommand &&
    config.modalStatusCommand
  ) {
    settings.set("execution.modalStatusCommand", config.modalStatusCommand);
  }
  if (
    !currentSettings.execution.modalInspectCommand &&
    config.modalInspectCommand
  ) {
    settings.set("execution.modalInspectCommand", config.modalInspectCommand);
  }
  if (
    !currentSettings.execution.commandTimeoutMs &&
    config.executionCommandTimeoutMs
  ) {
    settings.set(
      "execution.commandTimeoutMs",
      config.executionCommandTimeoutMs,
    );
  }
  if (
    !currentSettings.execution.healthTimeoutMs &&
    config.executionHealthTimeoutMs
  ) {
    settings.set("execution.healthTimeoutMs", config.executionHealthTimeoutMs);
  }
  if (
    !currentSettings.execution.containerCpuLimit &&
    config.containerCpuLimit
  ) {
    settings.set("execution.containerCpuLimit", config.containerCpuLimit);
  }
  if (
    !currentSettings.execution.containerMemoryLimit &&
    config.containerMemoryLimit
  ) {
    settings.set("execution.containerMemoryLimit", config.containerMemoryLimit);
  }
  if (
    !currentSettings.execution.containerPidsLimit &&
    config.containerPidsLimit
  ) {
    settings.set("execution.containerPidsLimit", config.containerPidsLimit);
  }
  if (currentSettings.execution.containerReadOnlyRoot === undefined) {
    settings.set(
      "execution.containerReadOnlyRoot",
      config.containerReadOnlyRoot,
    );
  }
  if (!currentSettings.execution.sshPort) {
    settings.set("execution.sshPort", config.sshPort);
  }
  if (!currentSettings.execution.sshKeyPath && config.sshKeyPath) {
    settings.set("execution.sshKeyPath", config.sshKeyPath);
  }
  if (
    !currentSettings.execution.sshStrictHostKeyChecking &&
    config.sshStrictHostKeyChecking
  ) {
    settings.set(
      "execution.sshStrictHostKeyChecking",
      config.sshStrictHostKeyChecking,
    );
  }
  if (!currentSettings.mcp.serverCommand && config.mcpServerCommand) {
    settings.set("mcp.serverCommand", config.mcpServerCommand);
  }
  if (!currentSettings.mcp.timeoutMs && config.mcpTimeoutMs) {
    settings.set("mcp.timeoutMs", config.mcpTimeoutMs);
  }
  const sessions = new SessionService(config.dataDir);
  const apiTransport = new ApiTransportService(join(config.dataDir, "api"));
  const nativePluginCatalog = getNativePluginCatalog(config);
  const nativePackageAudit = getNativePackageAudit(config);
  const mcp = new McpService(() => settings.get().mcp);
  let tools: ToolsService;
  const acp = new AcpService(
    config,
    () => (tools ? tools.baseDefinitions() : []),
    () => sessions.summary(),
    (limit) => sessions.listSessions(limit),
  );
  const repository = new RepositoryService(config.workspaceDir);
  const ecosystem = new EcosystemService();
  const autocoderPipeline = new AutocoderPipelineService(
    join(config.dataDir, "autocoder"),
  );
  const diagnostics = new DiagnosticsService(
    config,
    gatewayConfig,
    agentSdk,
    nativeOwnership,
    ecosystem,
  );
  const operator = new OperatorService(
    config,
    diagnostics,
    repository,
    autocoderPipeline,
    agentSdk,
    nativeOwnership,
    ecosystem,
  );
  const skills = new SkillsService(config.skillsDir, agentSdk);
  const skillSynthesis = new SkillSynthesisService(config.skillsDir);
  const skillsHub = new SkillsHubService(
    skills,
    skillSynthesis,
    agentSdk,
    config.dataDir,
  );
  const skillsHubSummary = skillsHub.summary();
  tools = new ToolsService(() => ({
    mcpEnabled: mcp.status().enabled,
    discoveredMcpTools: mcp.getCachedTools().length,
    acpEnabled: acp.status().enabled,
    nativePluginManagerTotal: nativePluginCatalog.length,
    nativePluginManagerEnabled: nativePluginCatalog.filter(
      (entry) => entry.enabled,
    ).length,
    nativePluginManagerOfficial: nativePluginCatalog.filter(
      (entry) => entry.source === "official",
    ).length,
    nativePluginManagerVendored: nativePluginCatalog.filter(
      (entry) => entry.source === "vendored",
    ).length,
    nativePluginManagerCategories: new Set(
      nativePluginCatalog.map((entry) => entry.category),
    ).size,
    nativeCatalog: nativePluginCatalog,
    nativeRuntimeLatest: nativePackageAudit.runtime.latest,
    nativeRuntimeAlpha: nativePackageAudit.runtime.alpha,
    nativeAlignedPackages: nativePackageAudit.summary.aligned,
    nativeAlphaOnlyPackages: nativePackageAudit.summary.alphaOnly,
    nativeLaggingLatestPackages: nativePackageAudit.summary.laggingLatest,
    nativeWorkspaceOnlyPackages: nativePackageAudit.summary.workspaceOnly,
    agentSdkRegistryAvailable: agentSdk.snapshot().registry?.available ?? false,
    agentSdkRegistryPlugins: agentSdk.snapshot().registry?.total ?? 0,
    agentSdkCatalogAvailable:
      agentSdk.snapshot().skillCatalog?.available ?? false,
    agentSdkCatalogSkills: agentSdk.snapshot().skillCatalog?.total ?? 0,
    agentSdkCompatibilityFailures:
      agentSdk
        .snapshot()
        .audit?.compatibility.filter((entry) => !entry.compatible).length ?? 0,
    skillsHubTotal: skillsHubSummary.workspaceTotal,
    skillsHubGenerated: skillsHubSummary.generatedTotal,
    skillsHubCatalogTotal: skillsHubSummary.catalogTotal,
    skillsHubManifestCount: skillsHubSummary.exportedManifests,
    skillsHubInstalledTotal: skillsHubSummary.installedTotal,
    skillsHubFamilyTotal: skillsHubSummary.familyTotal,
    ecosystemBenchmarkPacks: ecosystem.summary().benchmarkPacks,
    ecosystemDistributionChannels: ecosystem.summary().distributionChannels,
    ecosystemModelingProfiles: ecosystem.summary().modelingProfiles,
    nativeOwnershipControlPlane: nativeOwnership.controlPlane(),
    nativeOwnershipSnapshot: nativeOwnership.snapshotSync(),
  }));
  const getModelContext = (): {
    provider: "openai" | "anthropic" | "offline";
    model: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
    openAiApiKey: string | undefined;
    anthropicApiKey: string | undefined;
    anthropicBaseUrl: string | undefined;
    openAiImageModel: string | undefined;
    falApiKey: string | undefined;
  } => ({
    provider:
      settings.get().model.provider === "codex"
        ? "openai"
        : settings.get().model.provider === "claude-code"
          ? "anthropic"
          : (settings.get().model.provider as
              | "openai"
              | "anthropic"
              | "offline"),
    model: settings.get().model.model,
    baseUrl: settings.get().model.baseUrl,
    temperature: settings.get().model.temperature,
    maxTokens: settings.get().model.maxTokens,
    openAiApiKey: config.openAiApiKey,
    anthropicApiKey: config.anthropicApiKey,
    anthropicBaseUrl: config.anthropicBaseUrl,
    openAiImageModel: config.openAiImageModel,
    falApiKey: config.falApiKey,
  });

  return {
    apiTransport,
    agentSdk,
    nativeRegistry: createNativeServiceRegistry(),
    nativeOwnership,
    memory: new MemoryService(config.dataDir, {
      memory: config.memoryCharLimit,
      user: config.userCharLimit,
    }),
    skills,
    sessions,
    cron: new CronService(
      join(config.dataDir, "cron"),
      config.cronOutputDir,
      config.cronTickSeconds,
      config.timezone,
    ),
    pairing: new PairingService(join(config.gatewayDataDir, "pairing")),
    hooks: new HooksService(config.hooksDir),
    gatewaySessions: new GatewaySessionService(
      join(config.gatewayDataDir, "sessions"),
    ),
    executionApprovals: new ExecutionApprovalService(
      join(config.gatewayDataDir, "approvals"),
    ),
    delivery: new DeliveryService(join(config.gatewayDataDir, "delivery")),
    documents: new DocumentsService(
      runtime ?? ({} as ConstructorParameters<typeof DocumentsService>[0]),
      config.workspaceDir,
    ),
    ecosystem,
    gatewayConfig,
    personalities: new PersonalityService(config.dataDir),
    contextFiles: new ContextFilesService(config.workspaceDir),
    workspace: new WorkspaceService(config.workspaceDir),
    terminal: new TerminalService(
      join(config.dataDir, "terminal"),
      config.workspaceDir,
      () => settings.get(),
    ),
    repository,
    diagnostics,
    operator,
    tools,
    mcp,
    acp,
    autocoderPipeline,
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
    media: new MediaService(
      config.workspaceDir,
      join(config.dataDir, "media"),
      getModelContext,
    ),
    trajectories: new TrajectoryService(
      join(config.dataDir, "trajectories"),
      sessions,
      getModelContext,
    ),
    skillSynthesis,
    skillsHub,
    userProfiles: new UserProfileService(join(config.dataDir, "profiles")),
    settings,
  };
}
