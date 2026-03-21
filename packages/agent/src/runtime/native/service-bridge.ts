import type { IAgentRuntime } from "@elizaos/core";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { AppServices } from "@/services";
import type { EnvConfig, GatewayConfig } from "@/types";

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

export function getNativeServices(runtime: RuntimeLike) {
  return {
    knowledge: service<NativeKnowledgeService>(runtime, "knowledge"),
    personality: service<NativePersonalityService>(runtime, "personality"),
    rolodex: service<NativeRolodexService>(runtime, "rolodex"),
    shell: service<NativeShellService>(runtime, "shell"),
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
