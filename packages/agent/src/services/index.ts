import { join } from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
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
import { AwarenessService } from "./awareness-service";
import { ContextCompressionService } from "./context-compression-service";
import { ContextFilesService } from "./context-files-service";
import { CronService } from "./cron-service";
import { DelegationService } from "./delegation-service";
import { DeliveryService } from "./delivery-service";
import { DiagnosticsService } from "./diagnostics-service";
import { DocumentsService } from "./documents-service";
import { EcosystemService } from "./ecosystem-service";
import { ExecutionApprovalService } from "./execution-approval-service";
import { FuzzyPatchService } from "./fuzzy-patch-service";
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
import { RunControllerService } from "./run-controller-service";
import { SessionService } from "./session-service";
import { SettingsService } from "./settings-service";
import { SkillSynthesisService } from "./skill-synthesis-service";
import { SkillsHubService } from "./skills-hub-service";
import { SkillsService } from "./skills-service";
import { StartupStateService } from "./startup-state-service";
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
  contextCompression: ContextCompressionService;
  fuzzyPatch: FuzzyPatchService;
  runController: RunControllerService;
  awareness: AwarenessService;
  startupState: StartupStateService;
}

function createLazySlot<T>(factory: () => T): {
  get(): T;
  set(value: T): void;
  peek(): T | undefined;
} {
  let instance: T | undefined;
  return {
    get(): T {
      if (instance === undefined) {
        instance = factory();
      }
      return instance;
    },
    set(value: T): void {
      instance = value;
    },
    peek(): T | undefined {
      return instance;
    },
  };
}

export function createServices(
  config: EnvConfig,
  runtime?: ConstructorParameters<typeof DocumentsService>[0],
): AppServices {
  const stableElizaCloudLargeModel = "anthropic/claude-sonnet-4.6";
  const gatewayConfig = loadGatewayConfig(config);
  const agentSdk = new AgentSdkService();
  const nativeOwnership = new NativeOwnershipCache(config, gatewayConfig);
  const startupState = new StartupStateService();
  const cloudInferenceEnabled = config.elizaCloudEnabled;
  const provider:
    | "anthropic"
    | "openai"
    | "elizacloud"
    | "codex"
    | "claude-code"
    | "offline" = cloudInferenceEnabled
    ? "elizacloud"
    : config.anthropicApiKey
      ? "anthropic"
      : config.openAiApiKey
        ? "openai"
        : config.useLinkedClaudeCodeAuth
          ? "claude-code"
          : config.useLinkedCodexAuth
            ? "codex"
            : "offline";
  const defaultModel =
    provider === "elizacloud"
      ? config.elizaCloudLargeModel
      : provider === "anthropic" || provider === "claude-code"
        ? config.anthropicLargeModel
        : config.openAiModel;
  const defaultBaseUrl =
    provider === "elizacloud"
      ? config.elizaCloudBaseUrl
      : provider === "anthropic" || provider === "claude-code"
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
    agent: {
      runDepth: config.runDepth,
      maxIterations: config.maxIterations,
      toolProgressMode: config.toolProgressMode,
    },
    ui: {
      theme: "orange",
    },
  });
  const linkedAccounts = getLinkedProviderAccountsSnapshot();
  const currentSettings = settings.get();
  const cloudModelLooksStale = (model: string): boolean => {
    const normalized = model.trim().toLowerCase();
    return normalized === "openai/gpt-5" || normalized === "openai/gpt-5-mini";
  };
  const persistedProvider = currentSettings.model.provider;
  const persistedHasOpenAi =
    persistedProvider === "openai" && Boolean(config.openAiApiKey?.trim());
  const persistedHasAnthropic =
    persistedProvider === "anthropic" &&
    Boolean(config.anthropicApiKey?.trim());
  const persistedHasElizaCloud =
    persistedProvider === "elizacloud" &&
    config.elizaCloudEnabled &&
    Boolean(config.elizaCloudApiKey?.trim());
  const persistedHasCodex =
    persistedProvider === "codex" &&
    Boolean(linkedAccounts.codex.nativeReady || linkedAccounts.codex.reusable);
  const persistedHasClaudeCode =
    persistedProvider === "claude-code" &&
    Boolean(
      linkedAccounts.claudeCode.nativeReady ||
        linkedAccounts.claudeCode.reusable,
    );

  if (config.elizaCloudEnabled && config.elizaCloudApiKey?.trim()) {
    const desiredCloudModel = cloudModelLooksStale(config.elizaCloudLargeModel)
      ? stableElizaCloudLargeModel
      : config.elizaCloudLargeModel;
    const targetCloudModel = cloudModelLooksStale(currentSettings.model.model)
      ? desiredCloudModel
      : currentSettings.model.provider === "elizacloud"
        ? currentSettings.model.model
        : desiredCloudModel;
    if (
      currentSettings.model.provider !== "elizacloud" ||
      currentSettings.model.model !== targetCloudModel ||
      currentSettings.model.baseUrl !== config.elizaCloudBaseUrl
    ) {
      settings.set("model.provider", "elizacloud");
      settings.set("model.model", targetCloudModel);
      settings.set("model.baseUrl", config.elizaCloudBaseUrl);
    }
  } else if (
    persistedProvider === "elizacloud" &&
    (!config.elizaCloudEnabled || !config.elizaCloudApiKey?.trim())
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
    } else if (config.openAiApiKey?.trim()) {
      settings.set("model.provider", "openai");
      settings.set("model.model", config.openAiModel);
      settings.set("model.baseUrl", config.openAiBaseUrl);
    } else if (config.anthropicApiKey?.trim()) {
      settings.set("model.provider", "anthropic");
      settings.set("model.model", config.anthropicLargeModel);
      settings.set("model.baseUrl", config.anthropicBaseUrl ?? "");
    }
  }

  if (
    !persistedHasOpenAi &&
    !persistedHasAnthropic &&
    !persistedHasElizaCloud &&
    !persistedHasCodex &&
    !persistedHasClaudeCode
  ) {
    if (config.elizaCloudEnabled && config.elizaCloudApiKey?.trim()) {
      settings.set("model.provider", "elizacloud");
      settings.set("model.model", config.elizaCloudLargeModel);
      settings.set("model.baseUrl", config.elizaCloudBaseUrl);
    } else if (
      linkedAccounts.codex.nativeReady ||
      linkedAccounts.codex.reusable
    ) {
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
  let boundRuntime = runtime;
  const sessions = new SessionService(config.dataDir);
  const apiTransport = new ApiTransportService(join(config.dataDir, "api"));
  const nativePluginCatalog = createLazySlot(() =>
    getNativePluginCatalog(config),
  );
  const nativePackageAudit = createLazySlot(() =>
    getNativePackageAudit(config),
  );
  const mcp = new McpService(() => settings.get().mcp);
  let tools: ToolsService;
  const acp = new AcpService(
    config,
    () => (tools ? tools.baseDefinitions() : []),
    () => sessions.summary(),
    (limit) => sessions.listSessions(limit),
  );
  const repository = new RepositoryService(config.workspaceDir);
  const runController = new RunControllerService();
  const awareness = new AwarenessService();
  const ecosystem = createLazySlot(() => {
    startupState.markWarming("ecosystem", "loading ecosystem inventory");
    try {
      const service = new EcosystemService();
      startupState.markReady("ecosystem", "ecosystem inventory ready");
      return service;
    } catch (error) {
      startupState.markError(
        "ecosystem",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  });
  const autocoderPipeline = createLazySlot(
    () => new AutocoderPipelineService(join(config.dataDir, "autocoder")),
  );
  const diagnostics = createLazySlot(() => {
    startupState.markWarming("diagnostics", "building operator diagnostics");
    try {
      const service = new DiagnosticsService(
        config,
        gatewayConfig,
        agentSdk,
        nativeOwnership,
        ecosystem.get(),
        settings,
        runController,
        startupState,
        awareness,
      );
      if (boundRuntime) {
        service.attachRuntime(boundRuntime);
      }
      startupState.markReady("diagnostics", "operator diagnostics ready");
      return service;
    } catch (error) {
      startupState.markError(
        "diagnostics",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  });
  const operator = createLazySlot(() => {
    startupState.markWarming("operator", "building operator summaries");
    try {
      const service = new OperatorService(
        config,
        diagnostics.get(),
        repository,
        autocoderPipeline.get(),
        agentSdk,
        nativeOwnership,
        ecosystem.get(),
      );
      if (boundRuntime) {
        service.attachRuntime(boundRuntime);
      }
      startupState.markReady("operator", "operator summaries ready");
      return service;
    } catch (error) {
      startupState.markError(
        "operator",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  });
  const skills = createLazySlot(() => {
    startupState.markWarming("skills", "loading workspace and bundled skills");
    try {
      const service = new SkillsService(
        config.skillsDir,
        agentSdk,
        config.workspaceDir,
      );
      startupState.markReady("skills", "skills catalog ready");
      return service;
    } catch (error) {
      startupState.markError(
        "skills",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  });
  const skillSynthesis = createLazySlot(
    () => new SkillSynthesisService(config.skillsDir),
  );
  const skillsHub = createLazySlot(
    () =>
      new SkillsHubService(
        skills.get(),
        skillSynthesis.get(),
        agentSdk,
        config.dataDir,
      ),
  );
  tools = new ToolsService(() => ({
    mcpEnabled: mcp.status().enabled,
    discoveredMcpTools: mcp.getCachedTools().length,
    acpEnabled: acp.status().enabled,
    nativePluginManagerTotal: nativePluginCatalog.get().length,
    nativePluginManagerEnabled: nativePluginCatalog
      .get()
      .filter((entry) => entry.enabled).length,
    nativePluginManagerOfficial: nativePluginCatalog
      .get()
      .filter((entry) => entry.source === "official").length,
    nativePluginManagerVendored: nativePluginCatalog
      .get()
      .filter((entry) => entry.source === "vendored").length,
    nativePluginManagerCategories: new Set(
      nativePluginCatalog.get().map((entry) => entry.category),
    ).size,
    nativeCatalog: nativePluginCatalog.get(),
    nativeRuntimeLatest: nativePackageAudit.get().runtime.latest,
    nativeRuntimeAlpha: nativePackageAudit.get().runtime.alpha,
    nativeAlignedPackages: nativePackageAudit.get().summary.aligned,
    nativeAlphaOnlyPackages: nativePackageAudit.get().summary.alphaOnly,
    nativeLaggingLatestPackages: nativePackageAudit.get().summary.laggingLatest,
    nativeWorkspaceOnlyPackages: nativePackageAudit.get().summary.workspaceOnly,
    agentSdkRegistryAvailable: agentSdk.snapshot().registry?.available ?? false,
    agentSdkRegistryPlugins: agentSdk.snapshot().registry?.total ?? 0,
    agentSdkCatalogAvailable:
      agentSdk.snapshot().skillCatalog?.available ?? false,
    agentSdkCatalogSkills: agentSdk.snapshot().skillCatalog?.total ?? 0,
    agentSdkCompatibilityFailures:
      agentSdk
        .snapshot()
        .audit?.compatibility.filter((entry) => !entry.compatible).length ?? 0,
    skillsHubTotal: skillsHub.get().summary().workspaceTotal,
    skillsHubGenerated: skillsHub.get().summary().generatedTotal,
    skillsHubCatalogTotal: skillsHub.get().summary().catalogTotal,
    skillsHubManifestCount: skillsHub.get().summary().exportedManifests,
    skillsHubInstalledTotal: skillsHub.get().summary().installedTotal,
    skillsHubFamilyTotal: skillsHub.get().summary().familyTotal,
    ecosystemBenchmarkPacks: ecosystem.get().summary().benchmarkPacks,
    ecosystemDistributionChannels: ecosystem.get().summary()
      .distributionChannels,
    ecosystemModelingProfiles: ecosystem.get().summary().modelingProfiles,
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
      settings.get().model.provider === "codex" ||
      settings.get().model.provider === "elizacloud"
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

  const contextFiles = createLazySlot(
    () => new ContextFilesService(config.workspaceDir),
  );
  const documents = createLazySlot(
    () =>
      new DocumentsService(
        boundRuntime ??
          ({} as ConstructorParameters<typeof DocumentsService>[0]),
        config.workspaceDir,
      ),
  );
  const media = createLazySlot(
    () =>
      new MediaService(
        config.workspaceDir,
        join(config.dataDir, "media"),
        getModelContext,
      ),
  );
  const trajectories = createLazySlot(
    () =>
      new TrajectoryService(
        join(config.dataDir, "trajectories"),
        sessions,
        getModelContext,
      ),
  );
  const contextCompression = createLazySlot(
    () =>
      new ContextCompressionService({
        contextWindowTokens:
          ContextCompressionService.resolveContextWindow(defaultModel),
        threshold: 0.85,
        preserveRecentTurns: 6,
        preserveLeadingTurns: 2,
      }),
  );
  const fuzzyPatch = createLazySlot(
    () =>
      new FuzzyPatchService({
        maxEditDistance: 4,
        contextMatchRatio: 0.6,
      }),
  );

  const services = {
    apiTransport,
    agentSdk,
    nativeRegistry: createNativeServiceRegistry(),
    nativeOwnership,
    memory: new MemoryService(config.dataDir, {
      memory: config.memoryCharLimit,
      user: config.userCharLimit,
    }),
    get skills() {
      return skills.get();
    },
    set skills(value) {
      skills.set(value);
    },
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
    get documents() {
      return documents.get();
    },
    set documents(value) {
      documents.set(value);
    },
    get ecosystem() {
      return ecosystem.get();
    },
    set ecosystem(value) {
      ecosystem.set(value);
    },
    gatewayConfig,
    personalities: new PersonalityService(config.dataDir),
    get contextFiles() {
      return contextFiles.get();
    },
    set contextFiles(value) {
      contextFiles.set(value);
    },
    workspace: new WorkspaceService(config.workspaceDir),
    terminal: new TerminalService(
      join(config.dataDir, "terminal"),
      config.workspaceDir,
      () => settings.get(),
    ),
    repository,
    get diagnostics() {
      return diagnostics.get();
    },
    set diagnostics(value) {
      diagnostics.set(value);
    },
    get operator() {
      return operator.get();
    },
    set operator(value) {
      operator.set(value);
    },
    tools,
    mcp,
    acp,
    get autocoderPipeline() {
      return autocoderPipeline.get();
    },
    set autocoderPipeline(value) {
      autocoderPipeline.set(value);
    },
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
    get media() {
      return media.get();
    },
    set media(value) {
      media.set(value);
    },
    get trajectories() {
      return trajectories.get();
    },
    set trajectories(value) {
      trajectories.set(value);
    },
    get skillSynthesis() {
      return skillSynthesis.get();
    },
    set skillSynthesis(value) {
      skillSynthesis.set(value);
    },
    get skillsHub() {
      return skillsHub.get();
    },
    set skillsHub(value) {
      skillsHub.set(value);
    },
    userProfiles: new UserProfileService(join(config.dataDir, "profiles")),
    settings,
    get contextCompression() {
      return contextCompression.get();
    },
    set contextCompression(value) {
      contextCompression.set(value);
    },
    get fuzzyPatch() {
      return fuzzyPatch.get();
    },
    set fuzzyPatch(value) {
      fuzzyPatch.set(value);
    },
    runController,
    awareness,
    startupState,
  } satisfies AppServices & {
    __bindRuntime?: (nextRuntime: NonNullable<typeof runtime>) => void;
  };

  Object.defineProperty(services, "__bindRuntime", {
    enumerable: false,
    value: (nextRuntime: NonNullable<typeof runtime>) => {
      boundRuntime = nextRuntime;
      services.executionApprovals.bindRuntime(nextRuntime as IAgentRuntime);
      if (documents.peek()) {
        documents.set(new DocumentsService(nextRuntime, config.workspaceDir));
      }
      diagnostics.peek()?.attachRuntime(nextRuntime);
      operator.peek()?.attachRuntime(nextRuntime);
    },
  });

  return services;
}
