import type { IAgentRuntime } from "@elizaos/core";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { AppServices } from "@/services";
import type { EnvConfig, GatewayConfig } from "@/types";
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

interface NativeDiscordTransportService {
  status?: () => unknown;
  history?: (limit?: number) => unknown[];
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
) {
  return (
    getNativeServices(runtime).knowledge?.summary?.(target) ?? {
      target,
      entries: services.memory.list(target).length,
      characters: services.memory.read(target).length,
      preview: services.memory.list(target).slice(-5),
    }
  );
}

export function getEffectivePersonalitySummary(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    getNativeServices(runtime).personality?.summary?.() ?? {
      total: services.personalities.list().length,
      activeId: services.personalities.getActive().id,
      names: services.personalities.list().map((profile) => profile.name),
    }
  );
}

export function getEffectiveRolodexSummary(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    getNativeServices(runtime).rolodex?.summary?.() ?? {
      totalProfiles: services.userProfiles.list().length,
      agentName: services.userProfiles.getAgent().name,
      recentProfiles: services.userProfiles
        .list()
        .slice(0, 5)
        .map((profile) => profile.userId),
    }
  );
}

export function getEffectiveExperienceSummary(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    getNativeServices(runtime).experience?.summary?.() ?? {
      sessions: {
        totalSessions: services.sessions.listSessions(1000).length,
        recentSessionIds: services.sessions
          .latest(10)
          .map((session) => session.sessionId),
      },
      memory: {
        shared: getEffectiveMemorySnapshot(runtime, services, "memory"),
        user: getEffectiveMemorySnapshot(runtime, services, "user"),
      },
    }
  );
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

export function getAutonomousControlPlane(
  runtime: RuntimeLike,
  services: AppServices,
): AutonomousControlPlaneSummary {
  const native = getNativeServices(runtime);
  const skillsCatalog = services.agentSdk.snapshot().skillCatalog;
  const skillsSummary = getEffectiveSkillsSummary(runtime, services);
  const localSkills = getEffectiveSkills(runtime, services);
  const orchestratorTasks = getEffectiveDelegationTasks(runtime, services);
  const orchestratorQueue = getEffectiveDelegationQueue(runtime, services);
  const pluginInventory = getEffectivePluginManagerInventory(runtime);
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
    totals: {
      nativeServices: serviceSources.filter(Boolean).length,
      productFallbacks: serviceSources.filter((entry) => !entry).length,
    },
  };
}
