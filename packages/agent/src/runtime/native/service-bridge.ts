import type { IAgentRuntime } from "@elizaos/core";
import { benchmarkConfig } from "@elizaos/plugin-action-bench";
import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { AppServices } from "@/services";
import type { MemorySummary } from "@/services/memory-service";
import type {
  EnvConfig,
  GatewayConfig,
  UserProfileWorkspaceSummary,
} from "@/types";
import { describeAutonomousAlignment } from "./autonomous-stack";

interface NativeKnowledgeService {
  ingestPdf(path: string): Promise<unknown>;
  remember(text: string, source?: string): unknown;
  recall(query: string, limit?: number): unknown;
  summary?(target?: "memory" | "user"): unknown;
}

interface NativePersonalityService {
  list(): unknown[];
  get(id: string): unknown;
  activate(id: string): unknown;
  activeId(): string | undefined;
  summary?(): unknown;
}

interface NativeRolodexService {
  card(userId: string): unknown;
  remember(
    userId: string,
    kind: string,
    text: string,
    source?: string,
  ): unknown;
  recall(userId: string, query: string): unknown;
  observeAgent(text: string, source?: string): unknown;
  agentProfile(): unknown;
  summary?(): unknown;
  search?(query: string, limit?: number): unknown;
  beliefs?(userId: string): unknown;
  relationship?(userId: string): unknown;
  engagement?(userId: string): unknown;
}

interface NativeExperienceService {
  usage(sessionId: string): unknown;
  recent?(limit?: number): unknown;
  memorySnapshot?(): unknown;
  summary?(): unknown;
}

interface NativeShellService {
  run(command: string): Promise<unknown>;
  history(limit?: number): unknown[];
  status(): Promise<unknown>;
}

interface NativeBrowserService {
  status(): Promise<unknown>;
  fetch(url: string): Promise<unknown>;
  inspect(url: string): Promise<unknown>;
  snapshot(url: string): Promise<string>;
  screenshot(url: string): Promise<string>;
  capture(url: string): Promise<unknown>;
  analyze(url: string): Promise<unknown>;
  compare(leftUrl: string, rightUrl: string): Promise<unknown>;
  analyzeComparison(leftUrl: string, rightUrl: string): Promise<unknown>;
}

interface NativeMcpService {
  status(): unknown;
  probe(): Promise<unknown>;
  discoverTools(): Promise<unknown>;
  invoke(input: string): Promise<unknown>;
  invokeTool(name: string, input: Record<string, unknown>): Promise<unknown>;
  getCachedTools(): unknown[];
  searchCachedTools(query: string): unknown[];
  describeCachedTools(limit?: number): string;
  describeTool(name: string): string;
}

interface NativeCronService {
  list(): unknown[];
  get(id: string): unknown;
  create(input: unknown): unknown;
  update(id: string, patch: unknown): unknown;
  runs(limit?: number): unknown[];
}

interface NativeAgentSkillsService {
  list(): unknown[];
  get(slug: string): unknown;
  generated?(): unknown[];
  summary?(): unknown;
  catalog?(limit?: number): Promise<unknown>;
  searchCatalog?(query: string, limit?: number): Promise<unknown>;
  synthesize(taskId: string): Promise<unknown>;
}

interface NativeTrajectoryLoggerService {
  exportLatest(): unknown;
  bundles(): unknown[];
  compareLatest(): unknown;
}

interface NativeAgentOrchestratorService {
  createTask(
    title: string,
    objective: string,
    metadata?: Record<string, unknown>,
  ): unknown;
  getTask?(id: string): unknown;
  getChildren?(id: string): unknown[];
  tree?(id: string): unknown;
  queue(): unknown;
  overview?(): unknown;
  tasks(): unknown[];
  spawnChild?(
    parentId: string,
    input: {
      title: string;
      objective: string;
      metadata?: Record<string, unknown>;
      profile?: string;
      priority?: string;
      tags?: string[];
    },
  ): unknown;
  retryTask?(
    id: string,
    note?: string,
    options?: { cascadeChildren?: boolean },
  ): unknown;
  cancelTask?(id: string, note?: string): unknown;
}

interface NativePluginManagerService {
  list(): unknown[];
  categories(): unknown;
  summary?(): NativePluginManagerSummary;
}

interface NativePluginManagerSummary {
  total: number;
  enabled: number;
  official: number;
  vendored: number;
  categories: number;
}

interface NativePersonalitySummary {
  total: number;
  activeId?: string;
  names: string[];
}

interface NativeRolodexSummary extends UserProfileWorkspaceSummary {}

interface NativeExperienceSummary {
  sessions: {
    totalSessions: number;
    recentSessionIds: string[];
  };
  memory: {
    shared: MemorySummary;
    user: MemorySummary;
  };
}

interface NativeOwnershipControlPlaneSummary {
  serviceResolution: EffectiveServiceResolutionRecord[];
  transportControl: ReturnType<typeof getNativeTransportControlPlane>;
  pluginManager: ReturnType<typeof getEffectivePluginManagerInventory> | null;
  identity?: {
    personality: NativePersonalitySummary;
    rolodex: NativeRolodexSummary;
    experience: NativeExperienceSummary;
  };
  ecosystem?: ReturnType<AppServices["ecosystem"]["summary"]>;
}

interface NativeOwnershipSnapshot {
  controlPlane: NativeOwnershipControlPlaneSummary;
  integration: NativeIntegrationControlPlane;
  autonomous: AutonomousControlPlaneSummary;
  skillHub: ReturnType<AppServices["skillsHub"]["summary"]>;
  ecosystem: ReturnType<AppServices["ecosystem"]["summary"]>;
  media: ReturnType<typeof getNativeMediaControlPlane>;
  research: ReturnType<typeof getNativeResearchControlPlane>;
  forms: ReturnType<typeof getNativeFormsControlPlane>;
  execution: ReturnType<typeof getNativeExecutionControlPlane>;
}

interface NativeEcosystemSnapshot {
  runtime: {
    latest: string;
    alpha: string;
  };
  packageAudit: ReturnType<typeof getNativePackageAudit>;
  pluginCatalog: ReturnType<typeof getNativePluginCatalog>;
  sdk: Awaited<ReturnType<AppServices["agentSdk"]["overview"]>>;
  workspace: {
    summary: ReturnType<AppServices["ecosystem"]["summary"]>;
    benchmarks: ReturnType<AppServices["ecosystem"]["benchmarkPacks"]>;
    channels: ReturnType<AppServices["ecosystem"]["distributionChannels"]>;
    modeling: ReturnType<AppServices["ecosystem"]["modelingProfiles"]>;
    optionalSkillPacks: ReturnType<
      AppServices["ecosystem"]["optionalSkillPacks"]
    >;
  };
  ownership: NativeOwnershipSnapshot;
}

interface NativeDiscordTransportService {
  status?: () => unknown;
  history?: (limit?: number) => unknown[];
}

interface NativeCodeGenerationService {
  capabilityDescription?: string;
  performResearch?: (...args: unknown[]) => unknown;
  generatePRD?: (...args: unknown[]) => unknown;
  performQA?: (...args: unknown[]) => unknown;
  generateCode?: (...args: unknown[]) => unknown;
  generateCodeInternal?: (...args: unknown[]) => unknown;
  runValidationSuite?: (...args: unknown[]) => unknown;
  generateCodeInChunks?: (...args: unknown[]) => unknown;
  installDependencies?: (...args: unknown[]) => unknown;
}

interface NativeFormsService {
  capabilityDescription?: string;
  isPersistenceAvailable?: () => boolean;
  listForms?: () => unknown[];
  getTemplates?: () =>
    | Map<string, unknown>
    | unknown[]
    | Record<string, unknown>;
  createForm?: (
    templateOrForm: unknown,
    metadata?: unknown,
  ) => Promise<unknown>;
  getForm?: (formId: string) => Promise<unknown>;
  cancelForm?: (formId: string) => Promise<boolean>;
  forcePersist?: () => Promise<unknown>;
}

interface NativeE2BService {
  capabilityDescription?: string;
  listSandboxes?: () => Array<{
    id?: string;
    path?: string;
    template?: string;
    metadata?: Record<string, string>;
    createdAt?: string;
  }>;
  createSandbox?: (options?: {
    template?: string;
    metadata?: Record<string, string>;
  }) => Promise<string>;
  killSandbox?: (id?: string) => Promise<void>;
  executeCode?: (code: string, language?: string) => Promise<unknown>;
}

interface NativeGitHubService {
  capabilityDescription?: string;
  createRepository?: (name: string, isPrivate?: boolean) => Promise<unknown>;
  deleteRepository?: (name: string) => Promise<unknown>;
}

interface NativeSecretsManagerService {
  capabilityDescription?: string;
  getSecret?: (key: string) => Promise<unknown> | unknown;
  setSecret?: (key: string, value: string) => Promise<unknown> | unknown;
  hasSecret?: (key: string) => Promise<boolean> | boolean;
  listSecretKeys?: () => Promise<string[]> | string[];
}

interface NativeTelegramTransportService {
  bot?: unknown;
  messageManager?: unknown;
  knownChats?: Map<string | number, unknown>;
}

interface EffectiveDelegationCreateInput {
  title: string;
  objective: string;
  metadata?: Record<string, unknown>;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  labels?: string[];
  tags?: string[];
  executionMode?: "local" | "delegated";
  maxAttempts?: number;
}

interface EffectiveServiceResolutionRecord {
  capability: string;
  nativeService: string;
  source: "native" | "product";
  fallback: string;
  available: boolean;
}

type BrowserMcpServices = {
  web: {
    status(): Promise<unknown>;
  };
  mcp: {
    status(): unknown;
    getCachedTools(): unknown[];
  };
};

interface NativeIntegrationControlPlane {
  browser: {
    source: "native" | "product";
    available: boolean;
    status: unknown;
  };
  mcp: {
    source: "native" | "product";
    available: boolean;
    status: ReturnType<typeof getEffectiveMcpStatus>;
    cachedTools: unknown[];
  };
}

interface AutonomousControlPlaneSummary {
  alignment: ReturnType<typeof describeAutonomousAlignment>;
  skills: {
    source: "native" | "product";
    available: boolean;
    localSkills: number;
    workspaceTotal: number;
    workspaceCurated: number;
    workspaceGenerated: number;
    workspaceFamilies: number;
    catalogSkills: number;
    trendingSkills: number;
  };
  orchestrator: {
    source: "native" | "product";
    available: boolean;
    tasks: number;
    queuePending: number;
    activeWorkers: number;
  };
  trajectories: {
    source: "native" | "product";
    available: boolean;
    bundles: number;
    latestAvailable: boolean;
  };
  pluginManager: {
    source: "native" | "product";
    available: boolean;
    plugins: number;
    categories: number;
    enabled: number;
    official: number;
    vendored: number;
  };
  media: {
    tts: {
      source: "native-plugin" | "product";
      available: boolean;
      configured: boolean;
      provider: "fal" | "none";
    };
  };
  research: {
    actionBench: {
      source: "native-plugin";
      available: boolean;
      actions: number;
    };
    autocoder: {
      source: "native-plugin";
      available: boolean;
      ready: boolean;
    };
  };
  forms: {
    source: "native" | "product";
    available: boolean;
    total: number;
    templates: number;
  };
  execution: {
    e2b: {
      source: "native" | "product";
      available: boolean;
      sandboxes: number;
    };
    codeGeneration: {
      source: "native" | "product";
      available: boolean;
      ready: boolean;
    };
  };
  totals: {
    nativeServices: number;
    productFallbacks: number;
  };
}

type RuntimeLike = Partial<Pick<IAgentRuntime, "getService">>;

export type { RuntimeLike };

export interface EffectiveTransportInventoryEntry {
  platform:
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
  source: "official" | "vendored" | "custom" | "product";
  configEnabled: boolean;
  gatewayEnabled: boolean;
  operational: boolean;
  reason:
    | "live"
    | "gateway-disabled"
    | "not-configured"
    | "plugin-disabled"
    | "service-unavailable"
    | "custom-ready";
  detail: string;
  pluginId?: string;
  serviceName?: string;
  serviceAvailable?: boolean;
}

export interface EffectiveMessagingTransportEntry {
  platform: "telegram" | "discord";
  pluginId?: string;
  pluginSource?: "official" | "vendored" | "custom";
  configEnabled: boolean;
  pluginEnabled: boolean;
  gatewayEnabled: boolean;
  serviceName: string;
  serviceAvailable: boolean;
  live: boolean;
  reason: "live" | "not-configured" | "plugin-disabled" | "service-unavailable";
  detail: string;
}

export interface NativeMessagingTransportState
  extends EffectiveMessagingTransportEntry {
  ready: boolean;
  summary: string;
}

function service<T>(runtime: RuntimeLike, name: string): T | undefined {
  if (typeof runtime.getService !== "function") {
    return undefined;
  }
  return (runtime.getService(name) as T | null) ?? undefined;
}

function countQueuePending(queue: unknown): number {
  if (Array.isArray(queue)) {
    return queue.length;
  }
  if (queue && typeof queue === "object") {
    const record = queue as Record<string, unknown>;
    if (typeof record.pending === "number") {
      return record.pending;
    }
    if (typeof record.total === "number") {
      return record.total;
    }
  }
  return 0;
}

function countQueueActiveWorkers(queue: unknown): number {
  if (queue && typeof queue === "object") {
    const record = queue as Record<string, unknown>;
    if (typeof record.activeWorkers === "number") {
      return record.activeWorkers;
    }
  }
  return 0;
}

export function getNativeServices(runtime: RuntimeLike) {
  return {
    knowledge: service<NativeKnowledgeService>(runtime, "knowledge"),
    personality: service<NativePersonalityService>(runtime, "personality"),
    rolodex: service<NativeRolodexService>(runtime, "rolodex"),
    experience: service<NativeExperienceService>(runtime, "experience"),
    shell: service<NativeShellService>(runtime, "shell"),
    browser: service<NativeBrowserService>(runtime, "browser"),
    mcp: service<NativeMcpService>(runtime, "mcp"),
    cron: service<NativeCronService>(runtime, "cron"),
    agentSkills: service<NativeAgentSkillsService>(runtime, "agent_skills"),
    trajectoryLogger: service<NativeTrajectoryLoggerService>(
      runtime,
      "trajectory_logger",
    ),
    agentOrchestrator: service<NativeAgentOrchestratorService>(
      runtime,
      "agent_orchestrator",
    ),
    pluginManager: service<NativePluginManagerService>(
      runtime,
      "plugin_manager",
    ),
    telegram: service<NativeTelegramTransportService>(runtime, "telegram"),
    discordTransport: service<NativeDiscordTransportService>(
      runtime,
      "discord_transport",
    ),
    codeGeneration: service<NativeCodeGenerationService>(
      runtime,
      "code-generation",
    ),
    e2b: service<NativeE2BService>(runtime, "e2b"),
    forms: service<NativeFormsService>(runtime, "forms"),
    github: service<NativeGitHubService>(runtime, "github"),
    secretsManager: service<NativeSecretsManagerService>(
      runtime,
      "secrets-manager",
    ),
  };
}

function countRecordLikeEntries(value: unknown): number {
  if (value instanceof Map) {
    return value.size;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length;
  }
  return 0;
}

function countFormsByStatus(
  forms: unknown[],
  status: "active" | "completed" | "cancelled",
): number {
  return forms.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    return (
      ((entry as { status?: unknown }).status ?? "")
        .toString()
        .toLowerCase() === status
    );
  }).length;
}

function getSandboxRoot(
  sandboxes: Array<{ path?: string }>,
): string | undefined {
  return sandboxes.find((entry) => entry.path)?.path?.replace(/\/[^/]+$/, "");
}

export function getNativeFormsControlPlane(runtime: RuntimeLike) {
  const forms = getNativeServices(runtime).forms;
  const formList = forms?.listForms?.() ?? [];
  const formEntries = Array.isArray(formList) ? formList : [];
  const templates = countRecordLikeEntries(forms?.getTemplates?.());
  const persistenceAvailable = forms?.isPersistenceAvailable?.() ?? false;

  return {
    source: forms ? ("native-plugin" as const) : ("product" as const),
    available: Boolean(forms),
    capability:
      forms?.capabilityDescription ??
      "Structured form workflows for native autocoder and operator collection flows.",
    persistenceAvailable,
    templates,
    forms: {
      total: formEntries.length,
      active: countFormsByStatus(formEntries, "active"),
      completed: countFormsByStatus(formEntries, "completed"),
      cancelled: countFormsByStatus(formEntries, "cancelled"),
    },
    supportsForcePersist: typeof forms?.forcePersist === "function",
    detail: forms
      ? `Forms service is live with ${templates} templates and ${formEntries.length} tracked forms.`
      : "Forms service is not available in the native runtime.",
  };
}

export function getNativeExecutionControlPlane(runtime: RuntimeLike) {
  const native = getNativeServices(runtime);
  const sandboxes = native.e2b?.listSandboxes?.() ?? [];
  const activeSandboxId = sandboxes[0]?.id;
  const codeGenerationMethods = [
    "performResearch",
    "generatePRD",
    "performQA",
    "generateCode",
    "generateCodeInternal",
    "runValidationSuite",
    "generateCodeInChunks",
    "installDependencies",
  ].filter(
    (method) =>
      typeof native.codeGeneration?.[
        method as keyof NativeCodeGenerationService
      ] === "function",
  );
  const rawSecretKeys = native.secretsManager?.listSecretKeys?.();
  const secretKeys = Array.isArray(rawSecretKeys) ? rawSecretKeys : [];

  return {
    e2b: {
      source: native.e2b ? ("native-plugin" as const) : ("product" as const),
      available: Boolean(native.e2b),
      capability:
        native.e2b?.capabilityDescription ??
        "Local E2B-style sandbox execution for native code generation flows.",
      sandboxes: sandboxes.length,
      activeSandboxId,
      sandboxRoot: getSandboxRoot(sandboxes),
      supportsExecution: typeof native.e2b?.executeCode === "function",
      detail: native.e2b
        ? `E2B runtime has ${sandboxes.length} active sandboxes${activeSandboxId ? ` with ${activeSandboxId} selected` : ""}.`
        : "E2B sandbox service is unavailable.",
    },
    codeGeneration: {
      source: native.codeGeneration
        ? ("native-plugin" as const)
        : ("product" as const),
      available: Boolean(native.codeGeneration),
      capability:
        native.codeGeneration?.capabilityDescription ??
        "Native code generation and autocoder workflows.",
      methods: codeGenerationMethods,
      ready:
        Boolean(native.codeGeneration) &&
        Boolean(native.e2b) &&
        Boolean(native.forms),
      detail: native.codeGeneration
        ? `Code generation service exposes ${codeGenerationMethods.length} runtime methods.`
        : "Code generation service is unavailable.",
    },
    github: {
      available: Boolean(native.github),
      capability:
        native.github?.capabilityDescription ??
        "GitHub repository lifecycle support for code generation flows.",
      createRepository: typeof native.github?.createRepository === "function",
      deleteRepository: typeof native.github?.deleteRepository === "function",
    },
    secretsManager: {
      available: Boolean(native.secretsManager),
      capability:
        native.secretsManager?.capabilityDescription ??
        "Secrets management for native autocoder and deployment flows.",
      keys: secretKeys,
      hasListKeys: typeof native.secretsManager?.listSecretKeys === "function",
      hasRead: typeof native.secretsManager?.getSecret === "function",
      hasWrite: typeof native.secretsManager?.setSecret === "function",
    },
  };
}

export async function performEffectiveCodeResearch(
  runtime: RuntimeLike,
  request: Record<string, unknown>,
) {
  const codeGeneration = getNativeServices(runtime).codeGeneration;
  if (!codeGeneration?.performResearch) {
    throw new Error("Native code generation research is unavailable.");
  }
  return codeGeneration.performResearch(request);
}

export async function generateEffectivePrd(
  runtime: RuntimeLike,
  request: Record<string, unknown>,
  research: Record<string, unknown>,
) {
  const codeGeneration = getNativeServices(runtime).codeGeneration;
  if (!codeGeneration?.generatePRD) {
    throw new Error("Native PRD generation is unavailable.");
  }
  return codeGeneration.generatePRD(request, research);
}

export async function performEffectiveCodeQa(
  runtime: RuntimeLike,
  projectPath: string,
) {
  const codeGeneration = getNativeServices(runtime).codeGeneration;
  if (!codeGeneration?.performQA) {
    throw new Error("Native code generation QA is unavailable.");
  }
  return codeGeneration.performQA(projectPath);
}

export async function createEffectiveRepository(
  runtime: RuntimeLike,
  name: string,
  isPrivate = true,
) {
  const github = getNativeServices(runtime).github;
  if (!github?.createRepository) {
    throw new Error("Native GitHub service is unavailable.");
  }
  return github.createRepository(name, isPrivate);
}

export async function deleteEffectiveRepository(
  runtime: RuntimeLike,
  name: string,
) {
  const github = getNativeServices(runtime).github;
  if (!github?.deleteRepository) {
    throw new Error("Native GitHub service is unavailable.");
  }
  return github.deleteRepository(name);
}

export async function getEffectiveSecret(runtime: RuntimeLike, key: string) {
  const secretsManager = getNativeServices(runtime).secretsManager;
  if (!secretsManager?.getSecret) {
    throw new Error("Native secrets service is unavailable.");
  }
  return secretsManager.getSecret(key);
}

export async function setEffectiveSecret(
  runtime: RuntimeLike,
  key: string,
  value: string,
) {
  const secretsManager = getNativeServices(runtime).secretsManager;
  if (!secretsManager?.setSecret) {
    throw new Error("Native secrets service is unavailable.");
  }
  return secretsManager.setSecret(key, value);
}

export async function hasEffectiveSecret(runtime: RuntimeLike, key: string) {
  const secretsManager = getNativeServices(runtime).secretsManager;
  if (!secretsManager?.hasSecret) {
    throw new Error("Native secrets service is unavailable.");
  }
  return secretsManager.hasSecret(key);
}

export async function listEffectiveSecretKeys(runtime: RuntimeLike) {
  const secretsManager = getNativeServices(runtime).secretsManager;
  if (!secretsManager?.listSecretKeys) {
    throw new Error("Native secrets service is unavailable.");
  }
  return secretsManager.listSecretKeys();
}

export function getNativeMediaControlPlane(config: EnvConfig) {
  return {
    tts: {
      source: "native-plugin" as const,
      available: true,
      configured: Boolean(config.falApiKey),
      provider: config.falApiKey ? ("fal" as const) : ("none" as const),
      pluginAction: "GENERATE_TTS",
      preferredFormat: "mp3" as const,
      ready: Boolean(config.falApiKey),
      detail: config.falApiKey
        ? "Official TTS plugin path is enabled through FAL and can generate mp3 voice artifacts."
        : "Official TTS plugin is installed but FAL_API_KEY is missing, so voice generation falls back to provider or offline paths.",
    },
  };
}

export function getNativeResearchControlPlane(runtime: RuntimeLike) {
  const native = getNativeServices(runtime);
  const executionControl = getNativeExecutionControlPlane(runtime);
  const autocoderDependencies = {
    codeGeneration: Boolean(native.codeGeneration),
    e2b: Boolean(native.e2b),
    forms: Boolean(native.forms),
    github: Boolean(native.github),
    secretsManager: Boolean(native.secretsManager),
  };
  const autocoderReady =
    autocoderDependencies.codeGeneration &&
    autocoderDependencies.e2b &&
    autocoderDependencies.forms;

  return {
    actionBench: {
      source: "native-plugin" as const,
      available: true,
      actions: benchmarkConfig.totalActionsLoaded,
      suites: {
        typewriter: benchmarkConfig.typewriterEnabled,
        multiverseMath: benchmarkConfig.multiverseMathEnabled,
        relationalData: benchmarkConfig.relationalDataEnabled,
      },
      detail: `Official action-bench plugin is loaded with ${benchmarkConfig.totalActionsLoaded} benchmark actions.`,
    },
    autocoder: {
      source: "native-plugin" as const,
      available: true,
      ready: autocoderReady,
      capability:
        native.codeGeneration?.capabilityDescription ??
        "Generates ElizaOS projects through native autocoder services when dependencies are present.",
      methods: executionControl.codeGeneration.methods,
      dependencies: autocoderDependencies,
      detail: autocoderReady
        ? "Official autocoder runtime services are available."
        : "Official autocoder plugin is installed, but code-generation readiness still depends on e2b/forms-backed runtime services.",
    },
  };
}

async function resolveBrowserIntegrationStatus(
  runtime: RuntimeLike,
  services: BrowserMcpServices,
) {
  const native = getNativeServices(runtime).browser;
  if (native) {
    return {
      source: "native" as const,
      available: true,
      status: await native.status(),
    };
  }
  return {
    source: "product" as const,
    available: false,
    status: await services.web.status(),
  };
}

function resolveMcpIntegrationStatus(
  runtime: RuntimeLike,
  services: BrowserMcpServices,
) {
  const native = getNativeServices(runtime).mcp;
  if (native) {
    return {
      source: "native" as const,
      available: true,
      status: native.status(),
      cachedTools: native.getCachedTools(),
    };
  }
  return {
    source: "product" as const,
    available: false,
    status: services.mcp.status(),
    cachedTools: services.mcp.getCachedTools(),
  };
}

export async function getNativeIntegrationControlPlane(
  runtime: RuntimeLike,
  services: BrowserMcpServices,
): Promise<NativeIntegrationControlPlane> {
  const browser = await resolveBrowserIntegrationStatus(runtime, services);
  const mcp = resolveMcpIntegrationStatus(runtime, services);
  return {
    browser,
    mcp: {
      source: mcp.source,
      available: mcp.available,
      status: mcp.status,
      cachedTools: mcp.cachedTools,
    },
  };
}

export function getEffectiveMessagingTransportInventory(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): EffectiveMessagingTransportEntry[] {
  const native = getNativeServices(runtime);
  const catalog = getNativePluginCatalog(config);
  const telegramPlugin = catalog.find(
    (entry) => entry.id === "messaging.telegram",
  );
  const discordPlugin = catalog.find(
    (entry) => entry.id === "messaging.discord",
  );
  const telegramKnownChats =
    native.telegram?.knownChats instanceof Map
      ? native.telegram.knownChats.size
      : 0;
  const telegramLive = Boolean(
    telegramPlugin?.enabled &&
      native.telegram?.bot &&
      native.telegram?.messageManager,
  );
  const discordLive = Boolean(
    discordPlugin?.enabled &&
      native.discordTransport &&
      typeof native.discordTransport?.history === "function",
  );

  return [
    {
      platform: "telegram",
      pluginId: telegramPlugin?.id,
      pluginSource: telegramPlugin?.source,
      configEnabled: Boolean(config.telegramBotToken),
      pluginEnabled: Boolean(telegramPlugin?.enabled),
      gatewayEnabled: Boolean(gatewayConfig?.platforms.telegram.enabled),
      serviceName: "telegram",
      serviceAvailable: Boolean(native.telegram),
      live: telegramLive,
      reason: telegramLive
        ? "live"
        : telegramPlugin?.enabled
          ? "service-unavailable"
          : config.telegramBotToken
            ? "plugin-disabled"
            : "not-configured",
      detail: telegramLive
        ? `telegram service live; knownChats=${telegramKnownChats}`
        : telegramPlugin?.enabled
          ? "telegram plugin enabled but runtime service not fully live"
          : "telegram plugin disabled",
    },
    {
      platform: "discord",
      pluginId: discordPlugin?.id,
      pluginSource: discordPlugin?.source,
      configEnabled: Boolean(config.discordBotToken),
      pluginEnabled: Boolean(discordPlugin?.enabled),
      gatewayEnabled: Boolean(gatewayConfig?.platforms.discord.enabled),
      serviceName: "discord_transport",
      serviceAvailable: Boolean(native.discordTransport),
      live: discordLive,
      reason: discordLive
        ? "live"
        : discordPlugin?.enabled
          ? "service-unavailable"
          : config.discordBotToken
            ? "plugin-disabled"
            : "not-configured",
      detail: discordLive
        ? "discord transport service available through native bridge"
        : discordPlugin?.enabled
          ? "discord plugin enabled but runtime service not fully live"
          : "discord plugin disabled",
    },
  ];
}

export function getNativeMessagingTransportState(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig: GatewayConfig | undefined,
  platform: "telegram" | "discord",
): NativeMessagingTransportState | undefined {
  const entry = getEffectiveMessagingTransportInventory(
    runtime,
    config,
    gatewayConfig,
  ).find((transport) => transport.platform === platform);
  if (!entry) {
    return undefined;
  }
  const ready = entry.live && entry.gatewayEnabled;
  return {
    ...entry,
    ready,
    summary: [
      `${platform}:`,
      `config=${entry.configEnabled}`,
      `gateway=${entry.gatewayEnabled}`,
      `plugin=${entry.pluginEnabled}`,
      `service=${entry.serviceAvailable}`,
      `live=${entry.live}`,
      `ready=${ready}`,
      `reason=${entry.reason}`,
    ].join(" "),
  };
}

const ALL_TRANSPORT_PLATFORMS: EffectiveTransportInventoryEntry["platform"][] =
  [
    "api",
    "cli",
    "telegram",
    "discord",
    "slack",
    "whatsapp",
    "signal",
    "matrix",
    "email",
    "sms",
    "mattermost",
    "homeassistant",
    "dingtalk",
  ];

export function getEffectiveTransportInventory(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): EffectiveTransportInventoryEntry[] {
  const messagingBridge = getEffectiveMessagingTransportInventory(
    runtime,
    config,
    gatewayConfig,
  );
  const messagingMap = new Map(
    messagingBridge.map((entry) => [entry.platform, entry]),
  );
  const isGatewayEnabled = (
    platform: EffectiveTransportInventoryEntry["platform"],
  ) => Boolean(gatewayConfig?.platforms[platform].enabled);

  return ALL_TRANSPORT_PLATFORMS.map((platform) => {
    if (platform === "telegram" || platform === "discord") {
      const entry = messagingMap.get(platform);
      if (!entry) {
        return {
          platform,
          source: "custom",
          configEnabled: false,
          gatewayEnabled: isGatewayEnabled(platform),
          operational: false,
          reason: "not-configured",
          detail: `${platform} transport is not configured.`,
        };
      }
      return {
        platform,
        source: entry.pluginSource ?? "custom",
        configEnabled: entry.configEnabled,
        gatewayEnabled: entry.gatewayEnabled,
        operational: entry.live && entry.gatewayEnabled,
        reason: !entry.gatewayEnabled ? "gateway-disabled" : entry.reason,
        detail: !entry.gatewayEnabled
          ? `${platform} transport is disabled in gateway config.`
          : entry.detail,
        pluginId: entry.pluginId,
        serviceName: entry.serviceName,
        serviceAvailable: entry.serviceAvailable,
      };
    }

    const configEnabled = (() => {
      switch (platform) {
        case "api":
        case "cli":
          return true;
        case "slack":
          return Boolean(config.slackWebhookUrl && config.slackSigningSecret);
        case "whatsapp":
          return Boolean(
            config.whatsappAccessToken &&
              config.whatsappPhoneNumberId &&
              config.whatsappVerifyToken,
          );
        case "signal":
          return Boolean(config.signalCliCommand);
        case "matrix":
          return Boolean(config.matrixHomeserver && config.matrixAccessToken);
        case "email":
          return Boolean(config.emailSendCommand);
        case "sms":
          return Boolean(config.smsSendCommand);
        case "mattermost":
          return Boolean(config.mattermostUrl && config.mattermostToken);
        case "homeassistant":
          return Boolean(config.homeAssistantUrl && config.homeAssistantToken);
        case "dingtalk":
          return Boolean(
            config.dingtalkWebhookUrl || config.dingtalkAccessToken,
          );
      }
    })();

    const gatewayEnabled = isGatewayEnabled(platform);
    const operational = configEnabled && gatewayEnabled;

    return {
      platform,
      source: platform === "api" || platform === "cli" ? "product" : "custom",
      configEnabled,
      gatewayEnabled,
      operational,
      reason: operational
        ? "custom-ready"
        : !gatewayEnabled
          ? "gateway-disabled"
          : "not-configured",
      detail: operational
        ? `${platform} transport is configured and enabled.`
        : !gatewayEnabled
          ? `${platform} transport is disabled in gateway config.`
          : `${platform} transport is not configured.`,
    };
  });
}

export function getNativeTransportControlPlane(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): {
  messagingBridge: ReturnType<typeof getEffectiveMessagingTransportInventory>;
  messagingPlugins: ReturnType<typeof getNativePluginCatalog>;
  transportInventory: EffectiveTransportInventoryEntry[];
  totals: {
    configured: number;
    enabledPlugins: number;
    gatewayEnabled: number;
    availableServices: number;
    liveServices: number;
    officialPlugins: number;
    vendoredPlugins: number;
    operationalTransports: number;
    customTransports: number;
    productTransports: number;
  };
} {
  const messagingPlugins = getNativePluginCatalog(config).filter(
    (entry) => entry.category === "messaging",
  );
  const messagingBridge = getEffectiveMessagingTransportInventory(
    runtime,
    config,
    gatewayConfig,
  );
  const transportInventory = getEffectiveTransportInventory(
    runtime,
    config,
    gatewayConfig,
  );
  return {
    messagingBridge,
    messagingPlugins,
    transportInventory,
    totals: {
      configured: messagingBridge.length,
      enabledPlugins: messagingBridge.filter((entry) => entry.pluginEnabled)
        .length,
      gatewayEnabled: transportInventory.filter((entry) => entry.gatewayEnabled)
        .length,
      availableServices: messagingBridge.filter(
        (entry) => entry.serviceAvailable,
      ).length,
      liveServices: messagingBridge.filter((entry) => entry.live).length,
      officialPlugins: messagingBridge.filter(
        (entry) => entry.pluginSource === "official",
      ).length,
      vendoredPlugins: messagingBridge.filter(
        (entry) => entry.pluginSource === "vendored",
      ).length,
      operationalTransports: transportInventory.filter(
        (entry) => entry.operational,
      ).length,
      customTransports: transportInventory.filter(
        (entry) => entry.source === "custom",
      ).length,
      productTransports: transportInventory.filter(
        (entry) => entry.source === "product",
      ).length,
    },
  };
}

export function getEffectiveServiceResolution(
  runtime: RuntimeLike,
): EffectiveServiceResolutionRecord[] {
  const native = getNativeServices(runtime);
  return [
    {
      capability: "knowledge",
      nativeService: "knowledge",
      source: native.knowledge ? "native" : "product",
      fallback: "documents + memory + sessions",
      available: Boolean(native.knowledge),
    },
    {
      capability: "personality",
      nativeService: "personality",
      source: native.personality ? "native" : "product",
      fallback: "personalities",
      available: Boolean(native.personality),
    },
    {
      capability: "rolodex",
      nativeService: "rolodex",
      source: native.rolodex ? "native" : "product",
      fallback: "userProfiles",
      available: Boolean(native.rolodex),
    },
    {
      capability: "experience",
      nativeService: "experience",
      source: native.experience ? "native" : "product",
      fallback: "sessions + memory",
      available: Boolean(native.experience),
    },
    {
      capability: "shell",
      nativeService: "shell",
      source: native.shell ? "native" : "product",
      fallback: "terminal",
      available: Boolean(native.shell),
    },
    {
      capability: "browser",
      nativeService: "browser",
      source: native.browser ? "native" : "product",
      fallback: "web",
      available: Boolean(native.browser),
    },
    {
      capability: "mcp",
      nativeService: "mcp",
      source: native.mcp ? "native" : "product",
      fallback: "mcp",
      available: Boolean(native.mcp),
    },
    {
      capability: "cron",
      nativeService: "cron",
      source: native.cron ? "native" : "product",
      fallback: "cron",
      available: Boolean(native.cron),
    },
    {
      capability: "agentSkills",
      nativeService: "agent_skills",
      source: native.agentSkills ? "native" : "product",
      fallback: "skills + skillSynthesis",
      available: Boolean(native.agentSkills),
    },
    {
      capability: "trajectoryLogger",
      nativeService: "trajectory_logger",
      source: native.trajectoryLogger ? "native" : "product",
      fallback: "trajectories",
      available: Boolean(native.trajectoryLogger),
    },
    {
      capability: "agentOrchestrator",
      nativeService: "agent_orchestrator",
      source: native.agentOrchestrator ? "native" : "product",
      fallback: "delegation",
      available: Boolean(native.agentOrchestrator),
    },
    {
      capability: "pluginManager",
      nativeService: "plugin_manager",
      source: native.pluginManager ? "native" : "product",
      fallback: "native plugin catalog",
      available: Boolean(native.pluginManager),
    },
  ];
}

export function getEffectiveSkills(
  runtime: RuntimeLike,
  services: AppServices,
): unknown[] {
  return (
    getNativeServices(runtime).agentSkills?.list() ?? services.skills.list()
  );
}

export function getEffectiveSkillsSummary(
  runtime: RuntimeLike,
  services: AppServices,
) {
  const nativeSummary = getNativeServices(runtime).agentSkills?.summary?.();
  if (nativeSummary) {
    return nativeSummary;
  }
  const skillsService = services.skills as Partial<{
    summary: () => unknown;
    list: () => unknown[];
  }>;
  if (typeof skillsService.summary === "function") {
    return skillsService.summary();
  }
  const workspaceSkills = skillsService.list?.() ?? [];
  const roots = new Map<string, number>();
  const categories = new Map<string, number>();
  let generated = 0;
  for (const skill of workspaceSkills as Array<{ slug?: string }>) {
    const slug = String(skill.slug ?? "");
    const root = slug.split("/")[0] || "unknown";
    const category = slug.startsWith("generated/")
      ? "generated"
      : slug.split("/").slice(0, 2).join("/") || root;
    roots.set(root, (roots.get(root) ?? 0) + 1);
    categories.set(category, (categories.get(category) ?? 0) + 1);
    if (root === "generated") {
      generated += 1;
    }
  }
  return {
    total: workspaceSkills.length,
    curated: workspaceSkills.length - generated,
    generated,
    categories: [...categories.entries()].map(([name, count]) => ({
      name,
      count,
    })),
    roots: [...roots.entries()].map(([name, count]) => ({ name, count })),
  };
}

export function getEffectiveMemorySnapshot(
  runtime: RuntimeLike,
  services: AppServices,
  target: "memory" | "user" = "memory",
): MemorySummary {
  return (getNativeServices(runtime).knowledge?.summary?.(target) ??
    services.memory.summary(target)) as MemorySummary;
}

export function getEffectivePersonalitySummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativePersonalitySummary {
  return (getNativeServices(runtime).personality?.summary?.() ?? {
    ...(services.personalities?.summary?.() ?? {
      total: 0,
      names: [],
    }),
  }) as NativePersonalitySummary;
}

export function getEffectiveRolodexSummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativeRolodexSummary {
  return (getNativeServices(runtime).rolodex?.summary?.() ?? {
    ...services.userProfiles.summary(),
  }) as NativeRolodexSummary;
}

export function getEffectiveUserProfileSummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativeRolodexSummary {
  return getEffectiveRolodexSummary(runtime, services);
}

export function getEffectiveUserProfileSearch(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
  limit = 10,
) {
  return (
    getNativeServices(runtime).rolodex?.search?.(query, limit) ??
    services.userProfiles.search(query, limit)
  );
}

export function getEffectiveUserBeliefs(
  runtime: RuntimeLike,
  services: AppServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.beliefs?.(userId) ??
    services.userProfiles.beliefs(userId)
  );
}

export function getEffectiveUserRelationship(
  runtime: RuntimeLike,
  services: AppServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.relationship?.(userId) ??
    services.userProfiles.relationship(userId)
  );
}

export function getEffectiveUserEngagement(
  runtime: RuntimeLike,
  services: AppServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.engagement?.(userId) ??
    services.userProfiles.engagement(userId)
  );
}

export function getEffectiveExperienceSummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativeExperienceSummary {
  return (getNativeServices(runtime).experience?.summary?.() ?? {
    sessions: {
      ...services.sessions.summary(),
    },
    memory: {
      shared: getEffectiveMemorySnapshot(runtime, services, "memory"),
      user: getEffectiveMemorySnapshot(runtime, services, "user"),
    },
  }) as NativeExperienceSummary;
}

export function getNativeOwnershipControlPlane(
  runtime: RuntimeLike,
  services: AppServices | undefined,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): NativeOwnershipControlPlaneSummary {
  return {
    serviceResolution: getEffectiveServiceResolution(runtime),
    transportControl: getNativeTransportControlPlane(
      runtime,
      config,
      gatewayConfig,
    ),
    pluginManager: getEffectivePluginManagerInventory(runtime),
    identity: services
      ? {
          personality: getEffectivePersonalitySummary(runtime, services),
          rolodex: getEffectiveRolodexSummary(runtime, services),
          experience: getEffectiveExperienceSummary(runtime, services),
        }
      : undefined,
    ecosystem: services?.ecosystem.summary(),
  };
}

export function getEffectiveGeneratedSkills(
  runtime: RuntimeLike,
  services: AppServices,
): unknown[] {
  return (
    getNativeServices(runtime).agentSkills?.generated?.() ??
    services.skillSynthesis.listGeneratedSkills()
  );
}

export async function getEffectiveSkillCatalog(
  runtime: RuntimeLike,
  services: AppServices,
  limit = 20,
) {
  return (
    (await getNativeServices(runtime).agentSkills?.catalog?.(limit)) ??
    services.skills.catalog(limit)
  );
}

export async function getEffectiveSkillHubCatalog(
  services: AppServices,
  force = false,
  limit = 50,
) {
  return services.skillsHub.catalog(force, limit);
}

export async function searchEffectiveSkillHubCatalog(
  services: AppServices,
  query: string,
  limit = 15,
) {
  return services.skillsHub.searchCatalog(query, limit);
}

export function getEffectiveSkillHubSummary(services: AppServices) {
  return services.skillsHub.summary();
}

export function getEffectiveSkillHubWorkspace(services: AppServices) {
  return services.skillsHub.workspace();
}

export function getEffectiveSkillHubGenerated(services: AppServices) {
  return services.skillsHub.generated();
}

export function getEffectiveSkillHubFamilies(
  services: AppServices,
  limit = 50,
) {
  return services.skillsHub.families(false, limit);
}

export function getEffectiveSkillHubFamily(
  services: AppServices,
  slug: string,
) {
  return services.skillsHub.family(slug);
}

export function getEffectiveSkillHubInstalled(services: AppServices) {
  return services.skillsHub.installedManifests();
}

export function getEffectiveSkillHubInstalledManifest(
  services: AppServices,
  slug: string,
) {
  return services.skillsHub.installedManifest(slug);
}

export async function syncEffectiveSkillHub(
  services: AppServices,
  force = false,
) {
  return services.skillsHub.syncCatalog(force);
}

export function exportEffectiveSkillHubManifest(
  services: AppServices,
  slug: string,
  destinationPath?: string,
) {
  return services.skillsHub.exportManifest(slug, destinationPath);
}

export function importEffectiveSkillHubManifest(
  services: AppServices,
  sourcePath: string,
) {
  return services.skillsHub.importManifest(sourcePath);
}

export function installEffectiveSkillHubManifest(
  services: AppServices,
  slug: string,
) {
  return services.skillsHub.installFromCatalog(slug);
}

export async function searchEffectiveSkillCatalog(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
  limit = 15,
) {
  return (
    (await getNativeServices(runtime).agentSkills?.searchCatalog?.(
      query,
      limit,
    )) ?? services.skills.searchCatalog(query, limit)
  );
}

export function getEffectivePersonalityList(
  runtime: RuntimeLike,
  services: AppServices,
): unknown[] {
  return (
    getNativeServices(runtime).personality?.list() ??
    services.personalities.list()
  );
}

export async function runEffectiveShellCommand(
  runtime: RuntimeLike,
  services: AppServices,
  command: string,
) {
  return (
    (await getNativeServices(runtime).shell?.run(command)) ??
    services.terminal.run(command)
  );
}

export async function getEffectiveBrowserStatus(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (await resolveBrowserIntegrationStatus(runtime, services)).status;
}

export async function fetchEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
) {
  return (
    (await getNativeServices(runtime).browser?.fetch(url)) ??
    services.web.fetchText(url)
  );
}

export async function inspectEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
) {
  return (
    (await getNativeServices(runtime).browser?.inspect(url)) ??
    services.web.inspect(url)
  );
}

export async function snapshotEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
) {
  return (
    (await getNativeServices(runtime).browser?.snapshot(url)) ??
    services.web.snapshot(url)
  );
}

export async function screenshotEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
) {
  return (
    (await getNativeServices(runtime).browser?.screenshot(url)) ??
    services.web.screenshot(url)
  );
}

export async function captureEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
) {
  return (
    (await getNativeServices(runtime).browser?.capture(url)) ??
    services.web.capture(url)
  );
}

export async function analyzeEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<{ prompt: string } & Record<string, unknown>> {
  return (((await getNativeServices(runtime).browser?.analyze(url)) as
    | ({ prompt: string } & Record<string, unknown>)
    | undefined) ?? services.web.analyze(url)) as { prompt: string } & Record<
    string,
    unknown
  >;
}

export async function compareEffectiveBrowserPages(
  runtime: RuntimeLike,
  services: AppServices,
  leftUrl: string,
  rightUrl: string,
) {
  return (
    (await getNativeServices(runtime).browser?.compare(leftUrl, rightUrl)) ??
    services.web.compare(leftUrl, rightUrl)
  );
}

export async function analyzeEffectiveBrowserComparison(
  runtime: RuntimeLike,
  services: AppServices,
  leftUrl: string,
  rightUrl: string,
): Promise<{ prompt: string } & Record<string, unknown>> {
  return (((await getNativeServices(runtime).browser?.analyzeComparison(
    leftUrl,
    rightUrl,
  )) as ({ prompt: string } & Record<string, unknown>) | undefined) ??
    services.web.analyzeComparison(leftUrl, rightUrl)) as {
    prompt: string;
  } & Record<string, unknown>;
}

export function getEffectiveMcpStatus(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return resolveMcpIntegrationStatus(runtime, services).status;
}

export async function probeEffectiveMcp(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    (await getNativeServices(runtime).mcp?.probe()) ?? services.mcp.probe()
  );
}

export async function discoverEffectiveMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    (await getNativeServices(runtime).mcp?.discoverTools()) ??
    services.mcp.discoverTools()
  );
}

export function getEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return resolveMcpIntegrationStatus(runtime, services).cachedTools;
}

export function searchEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
) {
  return (
    getNativeServices(runtime).mcp?.searchCachedTools(query) ??
    services.mcp.searchCachedTools(query)
  );
}

export function describeEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
  limit = 20,
) {
  return (
    getNativeServices(runtime).mcp?.describeCachedTools(limit) ??
    services.mcp.describeCachedTools(limit)
  );
}

export function describeEffectiveMcpTool(
  runtime: RuntimeLike,
  services: AppServices,
  name: string,
) {
  return (
    getNativeServices(runtime).mcp?.describeTool(name) ??
    services.mcp.describeTool(name)
  );
}

export async function invokeEffectiveMcp(
  runtime: RuntimeLike,
  services: AppServices,
  input: string,
) {
  return (
    (await getNativeServices(runtime).mcp?.invoke(input)) ??
    services.mcp.invoke(input)
  );
}

export async function invokeEffectiveMcpTool(
  runtime: RuntimeLike,
  services: AppServices,
  name: string,
  input: Record<string, unknown>,
) {
  return (
    (await getNativeServices(runtime).mcp?.invokeTool(name, input)) ??
    services.mcp.invokeTool(name, input)
  );
}

export function getEffectiveShellHistory(
  runtime: RuntimeLike,
  services: AppServices,
  limit = 10,
): unknown[] {
  return (
    getNativeServices(runtime).shell?.history(limit) ??
    services.terminal.recent(limit)
  );
}

export async function getEffectiveShellStatus(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    (await getNativeServices(runtime).shell?.status()) ??
    services.terminal.status()
  );
}

export function getEffectiveDelegationTasks(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.tasks() ??
    services.delegation.list()
  );
}

export function getEffectiveDelegationQueue(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.queue() ??
    services.delegation.queueSummary()
  );
}

export function getEffectiveDelegationOverview(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.overview?.() ??
    services.delegation.overview()
  );
}

export function getEffectiveDelegationTask(
  runtime: RuntimeLike,
  services: AppServices,
  id: string,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.getTask?.(id) ??
    services.delegation.get(id)
  );
}

export function getEffectiveDelegationChildren(
  runtime: RuntimeLike,
  services: AppServices,
  parentId: string,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.getChildren?.(parentId) ??
    services.delegation.listChildren(parentId)
  );
}

export function getEffectiveDelegationTree(
  runtime: RuntimeLike,
  services: AppServices,
  id: string,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.tree?.(id) ??
    services.delegation.tree(id)
  );
}

export function retryEffectiveDelegationTask(
  runtime: RuntimeLike,
  services: AppServices,
  id: string,
  note?: string,
  options?: { cascadeChildren?: boolean },
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.retryTask?.(
      id,
      note,
      options,
    ) ?? services.delegation.requeue(id, note, options)
  );
}

export function createEffectiveDelegationTask(
  runtime: RuntimeLike,
  services: AppServices,
  input: EffectiveDelegationCreateInput,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.createTask(
      input.title,
      input.objective,
      {
        group: input.group,
        profile: input.profile,
        priority: input.priority,
        labels: input.labels ?? input.tags,
        tags: input.tags ?? input.labels,
        executionMode: input.executionMode,
        maxAttempts: input.maxAttempts,
        ...input.metadata,
      },
    ) ??
    services.delegation.create({
      title: input.title,
      objective: input.objective,
      group: input.group,
      profile: input.profile,
      priority: input.priority,
      labels: input.labels ?? input.tags,
      tags: input.tags ?? input.labels,
      metadata: input.metadata
        ? Object.fromEntries(
            Object.entries(input.metadata).map(([key, value]) => [
              key,
              String(value),
            ]),
          )
        : undefined,
      executionMode: input.executionMode,
      maxAttempts: input.maxAttempts,
    })
  );
}

export function getEffectivePluginManagerInventory(runtime: RuntimeLike): {
  plugins: unknown[];
  categories: unknown;
  summary: NativePluginManagerSummary;
} | null {
  const pluginManager = getNativeServices(runtime).pluginManager;
  if (!pluginManager) {
    return null;
  }
  const plugins = pluginManager.list();
  const categories = pluginManager.categories();
  const summary = pluginManager.summary?.() ?? {
    total: Array.isArray(plugins) ? plugins.length : 0,
    enabled: Array.isArray(plugins)
      ? plugins.filter(
          (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            "enabled" in entry &&
            Boolean((entry as { enabled?: unknown }).enabled),
        ).length
      : 0,
    official: Array.isArray(plugins)
      ? plugins.filter(
          (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            "source" in entry &&
            (entry as { source?: unknown }).source === "official",
        ).length
      : 0,
    vendored: Array.isArray(plugins)
      ? plugins.filter(
          (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            "source" in entry &&
            (entry as { source?: unknown }).source === "vendored",
        ).length
      : 0,
    categories:
      categories && typeof categories === "object"
        ? Object.keys(categories as Record<string, unknown>).length
        : 0,
  };
  return {
    plugins,
    categories,
    summary,
  };
}

export async function listEffectiveForms(
  runtime: RuntimeLike,
): Promise<unknown[]> {
  return getNativeServices(runtime).forms?.listForms?.() ?? [];
}

export function getEffectiveFormTemplates(runtime: RuntimeLike) {
  const templates = getNativeServices(runtime).forms?.getTemplates?.();
  if (templates instanceof Map) {
    return [...templates.entries()].map(([id, value]) => ({ id, value }));
  }
  if (Array.isArray(templates)) {
    return templates;
  }
  if (templates && typeof templates === "object") {
    return Object.entries(templates).map(([id, value]) => ({ id, value }));
  }
  return [];
}

export async function createEffectiveForm(
  runtime: RuntimeLike,
  templateOrForm: unknown,
  metadata?: unknown,
) {
  const forms = getNativeServices(runtime).forms;
  if (!forms?.createForm) {
    throw new Error("Native forms service is unavailable.");
  }
  return forms.createForm(templateOrForm, metadata);
}

export async function getEffectiveForm(runtime: RuntimeLike, formId: string) {
  const forms = getNativeServices(runtime).forms;
  if (!forms?.getForm) {
    throw new Error("Native forms service is unavailable.");
  }
  return forms.getForm(formId);
}

export async function cancelEffectiveForm(
  runtime: RuntimeLike,
  formId: string,
) {
  const forms = getNativeServices(runtime).forms;
  if (!forms?.cancelForm) {
    throw new Error("Native forms service is unavailable.");
  }
  return forms.cancelForm(formId);
}

export function listEffectiveSandboxes(runtime: RuntimeLike) {
  return getNativeServices(runtime).e2b?.listSandboxes?.() ?? [];
}

export async function createEffectiveSandbox(
  runtime: RuntimeLike,
  options?: {
    template?: string;
    metadata?: Record<string, string>;
  },
) {
  const e2b = getNativeServices(runtime).e2b;
  if (!e2b?.createSandbox) {
    throw new Error("Native E2B service is unavailable.");
  }
  return e2b.createSandbox(options);
}

export async function killEffectiveSandbox(runtime: RuntimeLike, id?: string) {
  const e2b = getNativeServices(runtime).e2b;
  if (!e2b?.killSandbox) {
    throw new Error("Native E2B service is unavailable.");
  }
  return e2b.killSandbox(id);
}

export async function executeEffectiveSandboxCode(
  runtime: RuntimeLike,
  code: string,
  language = "python",
) {
  const e2b = getNativeServices(runtime).e2b;
  if (!e2b?.executeCode) {
    throw new Error("Native E2B service is unavailable.");
  }
  return e2b.executeCode(code, language);
}

export async function generateEffectiveCode(
  runtime: RuntimeLike,
  request: Record<string, unknown>,
) {
  const codeGeneration = getNativeServices(runtime).codeGeneration;
  if (!codeGeneration?.generateCode) {
    throw new Error("Native code generation service is unavailable.");
  }
  return codeGeneration.generateCode(request);
}

export function getAutonomousControlPlane(
  runtime: RuntimeLike,
  services: AppServices,
  config?: EnvConfig,
): AutonomousControlPlaneSummary {
  const native = getNativeServices(runtime);
  const formsControl = getNativeFormsControlPlane(runtime);
  const executionControl = getNativeExecutionControlPlane(runtime);
  const skillsCatalog = services.agentSdk.snapshot().skillCatalog;
  const skillsSummary = getEffectiveSkillsSummary(runtime, services);
  const localSkills = getEffectiveSkills(runtime, services);
  const orchestratorTasks = getEffectiveDelegationTasks(runtime, services);
  const orchestratorQueue = getEffectiveDelegationQueue(runtime, services);
  const pluginInventory = getEffectivePluginManagerInventory(runtime);
  const mediaControl = config
    ? getNativeMediaControlPlane(config)
    : {
        tts: {
          source: "native-plugin" as const,
          available: true,
          configured: false,
          provider: "none" as const,
        },
      };
  const researchControl = getNativeResearchControlPlane(runtime);
  const trajectorySource = native.trajectoryLogger;
  const trajectoryBundles =
    native.trajectoryLogger?.bundles() ?? services.trajectories.listBundles();
  const latestTrajectory =
    native.trajectoryLogger?.exportLatest() ??
    services.trajectories.exportLatest();

  const serviceSources = [
    native.agentSkills,
    native.agentOrchestrator,
    native.trajectoryLogger,
    native.pluginManager,
  ];

  return {
    alignment: describeAutonomousAlignment(),
    skills: {
      source: native.agentSkills ? "native" : "product",
      available: Boolean(native.agentSkills),
      localSkills: Array.isArray(localSkills) ? localSkills.length : 0,
      workspaceTotal:
        typeof skillsSummary === "object" && skillsSummary !== null
          ? Number(
              (skillsSummary as { total?: number }).total ?? localSkills.length,
            )
          : localSkills.length,
      workspaceCurated:
        typeof skillsSummary === "object" && skillsSummary !== null
          ? Number((skillsSummary as { curated?: number }).curated ?? 0)
          : 0,
      workspaceGenerated:
        typeof skillsSummary === "object" && skillsSummary !== null
          ? Number((skillsSummary as { generated?: number }).generated ?? 0)
          : 0,
      workspaceFamilies:
        typeof skillsSummary === "object" && skillsSummary !== null
          ? ((skillsSummary as { roots?: Array<{ name: string }> }).roots
              ?.length ?? 0)
          : 0,
      catalogSkills: skillsCatalog?.total ?? 0,
      trendingSkills: skillsCatalog?.trending?.length ?? 0,
    },
    orchestrator: {
      source: native.agentOrchestrator ? "native" : "product",
      available: Boolean(native.agentOrchestrator),
      tasks: Array.isArray(orchestratorTasks) ? orchestratorTasks.length : 0,
      queuePending: countQueuePending(orchestratorQueue),
      activeWorkers: countQueueActiveWorkers(orchestratorQueue),
    },
    trajectories: {
      source: trajectorySource ? "native" : "product",
      available: Boolean(trajectorySource),
      bundles: Array.isArray(trajectoryBundles) ? trajectoryBundles.length : 0,
      latestAvailable: Boolean(latestTrajectory),
    },
    pluginManager: {
      source: native.pluginManager ? "native" : "product",
      available: Boolean(native.pluginManager),
      plugins: pluginInventory?.summary.total ?? 0,
      categories: pluginInventory?.summary.categories ?? 0,
      enabled: pluginInventory?.summary.enabled ?? 0,
      official: pluginInventory?.summary.official ?? 0,
      vendored: pluginInventory?.summary.vendored ?? 0,
    },
    media: {
      tts: {
        source: "native-plugin",
        available: true,
        configured: mediaControl.tts.configured,
        provider: mediaControl.tts.provider,
      },
    },
    research: {
      actionBench: {
        source: "native-plugin",
        available: researchControl.actionBench.available,
        actions: researchControl.actionBench.actions,
      },
      autocoder: {
        source: "native-plugin",
        available: researchControl.autocoder.available,
        ready: researchControl.autocoder.ready,
      },
    },
    forms: {
      source: native.forms ? "native" : "product",
      available: Boolean(native.forms),
      total: formsControl.forms.total,
      templates: formsControl.templates,
    },
    execution: {
      e2b: {
        source: native.e2b ? "native" : "product",
        available: Boolean(native.e2b),
        sandboxes: executionControl.e2b.sandboxes,
      },
      codeGeneration: {
        source: native.codeGeneration ? "native" : "product",
        available: Boolean(native.codeGeneration),
        ready: executionControl.codeGeneration.ready,
      },
    },
    totals: {
      nativeServices: serviceSources.filter(Boolean).length,
      productFallbacks: serviceSources.filter((entry) => !entry).length,
    },
  };
}

export async function getNativeOwnershipSnapshot(
  runtime: RuntimeLike,
  services: AppServices,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): Promise<NativeOwnershipSnapshot> {
  const [integration, controlPlane] = await Promise.all([
    getNativeIntegrationControlPlane(runtime, {
      web: {
        status: () => services.web.status(),
      },
      mcp: {
        status: () => services.mcp.status(),
        getCachedTools: () => services.mcp.getCachedTools(),
      },
    }),
    Promise.resolve(
      getNativeOwnershipControlPlane(runtime, services, config, gatewayConfig),
    ),
  ]);

  return {
    controlPlane,
    integration,
    autonomous: getAutonomousControlPlane(runtime, services, config),
    skillHub: services.skillsHub.summary(),
    ecosystem: services.ecosystem.summary(),
    media: getNativeMediaControlPlane(config),
    research: getNativeResearchControlPlane(runtime),
    forms: getNativeFormsControlPlane(runtime),
    execution: getNativeExecutionControlPlane(runtime),
  };
}

export async function getNativeEcosystemSnapshot(
  runtime: RuntimeLike,
  services: AppServices,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
  refresh = false,
): Promise<NativeEcosystemSnapshot> {
  const [sdk, ownership] = await Promise.all([
    services.agentSdk.overview(refresh),
    services.nativeOwnership
      .snapshot(refresh)
      .then(
        (snapshot) =>
          snapshot ??
          getNativeOwnershipSnapshot(runtime, services, config, gatewayConfig),
      ),
  ]);

  return {
    runtime: {
      latest: getNativePackageAudit(config).runtime.latest,
      alpha: getNativePackageAudit(config).runtime.alpha,
    },
    packageAudit: getNativePackageAudit(config),
    pluginCatalog: getNativePluginCatalog(config),
    sdk,
    workspace: {
      summary: services.ecosystem.summary(),
      benchmarks: services.ecosystem.benchmarkPacks(),
      channels: services.ecosystem.distributionChannels(),
      modeling: services.ecosystem.modelingProfiles(),
      optionalSkillPacks: services.ecosystem.optionalSkillPacks(),
    },
    ownership,
  };
}
