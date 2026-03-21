import type { IAgentRuntime } from "@elizaos/core";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { AppServices } from "@/services";
import type { EnvConfig, GatewayConfig } from "@/types";
import { describeAutonomousAlignment } from "./autonomous-stack";

interface NativeKnowledgeService {
  ingestPdf(path: string): Promise<unknown>;
  remember(text: string, source?: string): unknown;
  recall(query: string, limit?: number): unknown;
}

interface NativePersonalityService {
  list(): unknown[];
  get(id: string): unknown;
  activate(id: string): unknown;
  activeId(): string | undefined;
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
  queue(): unknown;
  tasks(): unknown[];
}

interface NativePluginManagerService {
  list(): unknown[];
  categories(): unknown;
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
): Array<{
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
}> {
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

export function getEffectivePluginManagerInventory(
  runtime: RuntimeLike,
): { plugins: unknown[]; categories: unknown } | null {
  const pluginManager = getNativeServices(runtime).pluginManager;
  if (!pluginManager) {
    return null;
  }
  return {
    plugins: pluginManager.list(),
    categories: pluginManager.categories(),
  };
}

export function getAutonomousControlPlane(
  runtime: RuntimeLike,
  services: AppServices,
): AutonomousControlPlaneSummary {
  const native = getNativeServices(runtime);
  const skillsCatalog = services.agentSdk.snapshot().skillCatalog;
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
      plugins: pluginInventory?.plugins.length ?? 0,
      categories: pluginInventory?.categories
        ? Object.keys(pluginInventory.categories as Record<string, unknown>)
            .length
        : 0,
    },
    totals: {
      nativeServices: serviceSources.filter(Boolean).length,
      productFallbacks: serviceSources.filter((entry) => !entry).length,
    },
  };
}
