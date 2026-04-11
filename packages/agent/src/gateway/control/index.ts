import type { AppContext } from "@/runtime/bootstrap";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog/index";
import { getNativeTransportControlPlane } from "@/runtime/native/service-bridge/index";
import type { PlatformName } from "@/types/gateway";

export type GatewayTraceKind =
  | "receive"
  | "authorize"
  | "session"
  | "route"
  | "respond"
  | "deliver"
  | "update"
  | "heartbeat"
  | "reject"
  | "lifecycle";

export interface GatewayFilterOptions {
  limit?: number;
  platform?: PlatformName;
  sessionId?: string;
  kind?: GatewayTraceKind;
}

export const TRANSPORT_PLATFORM_NAMES: PlatformName[] = [
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

const GATEWAY_TRACE_KINDS: GatewayTraceKind[] = [
  "receive",
  "authorize",
  "session",
  "route",
  "respond",
  "deliver",
  "update",
  "heartbeat",
  "reject",
  "lifecycle",
];

export function parseTransportPlatform(raw: string): PlatformName | undefined {
  const platform = raw.trim().toLowerCase();
  return TRANSPORT_PLATFORM_NAMES.includes(platform as PlatformName)
    ? (platform as PlatformName)
    : undefined;
}

export function parseGatewayFiltersFromUrl(
  url: URL,
  fallbackLimit = 25,
): Required<Pick<GatewayFilterOptions, "limit">> & GatewayFilterOptions {
  const rawLimit = Number(url.searchParams.get("limit") ?? `${fallbackLimit}`);
  const platform = url.searchParams.get("platform") ?? undefined;
  const sessionId =
    url.searchParams.get("sessionId") ??
    url.searchParams.get("session") ??
    undefined;
  const kind = url.searchParams.get("kind") ?? undefined;

  return {
    limit: Number.isNaN(rawLimit) || rawLimit <= 0 ? fallbackLimit : rawLimit,
    platform: platform ? parseTransportPlatform(platform) : undefined,
    sessionId,
    kind:
      kind && GATEWAY_TRACE_KINDS.includes(kind as GatewayTraceKind)
        ? (kind as GatewayTraceKind)
        : undefined,
  };
}

export function parseGatewayFiltersFromText(raw: string): GatewayFilterOptions {
  const options: GatewayFilterOptions = {};

  for (const token of raw.split(/\s+/u).filter(Boolean)) {
    if (token.startsWith("limit:")) {
      const limit = Number(token.replace("limit:", "").trim());
      if (!Number.isNaN(limit) && limit > 0) {
        options.limit = limit;
      }
      continue;
    }

    if (token.startsWith("platform:")) {
      const platform = parseTransportPlatform(
        token.replace("platform:", "").trim(),
      );
      if (platform) {
        options.platform = platform;
      }
      continue;
    }

    if (token.startsWith("session:") || token.startsWith("sessionId:")) {
      options.sessionId = token.replace(/^session(Id)?:/u, "").trim();
      continue;
    }

    if (token.startsWith("kind:")) {
      const kind = token.replace("kind:", "").trim();
      if (GATEWAY_TRACE_KINDS.includes(kind as GatewayTraceKind)) {
        options.kind = kind as GatewayTraceKind;
      }
    }
  }

  return options;
}

function formatTransportField(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "n/a";
  }
  return String(value);
}

export interface TransportDrilldown {
  platform: PlatformName;
  inventory?: ReturnType<
    typeof getNativeTransportControlPlane
  >["transportInventory"][number];
  bridge?: ReturnType<
    typeof getNativeTransportControlPlane
  >["messagingBridge"][number];
  runtime?: {
    transportInventory?: ReturnType<
      typeof getNativeTransportControlPlane
    >["transportInventory"][number];
    transportControl: ReturnType<
      typeof getNativeTransportControlPlane
    >["totals"];
    messagingBridge?: ReturnType<
      typeof getNativeTransportControlPlane
    >["messagingBridge"][number];
  };
  gateway?: {
    detail?: Awaited<ReturnType<AppContext["gateway"]["transport"]>>;
    health?: Awaited<
      ReturnType<AppContext["gateway"]["transport"]>
    >["readiness"];
    state?: Awaited<
      ReturnType<AppContext["gateway"]["transport"]>
    >["platformState"];
    summary?: string;
    history?: {
      traces: Awaited<
        ReturnType<AppContext["gateway"]["transport"]>
      >["recentTraces"];
      inbox: Awaited<
        ReturnType<AppContext["gateway"]["transport"]>
      >["recentInbox"];
      outbox: Awaited<
        ReturnType<AppContext["gateway"]["transport"]>
      >["recentOutbox"];
      attachments: Awaited<
        ReturnType<AppContext["gateway"]["transport"]>
      >["recentAttachments"];
    };
  };
  plugin?: ReturnType<typeof getNativePluginCatalog>[number];
  controlPlane: ReturnType<typeof getNativeTransportControlPlane>;
}

export async function buildTransportDrilldown(
  context: Pick<AppContext, "runtime" | "config" | "services" | "gateway">,
  platform: PlatformName,
): Promise<TransportDrilldown> {
  const controlPlane = getNativeTransportControlPlane(
    context.runtime,
    context.config,
    context.services.gatewayConfig,
  );
  const inventory = controlPlane.transportInventory.find(
    (entry) => entry.platform === platform,
  );
  const bridge = controlPlane.messagingBridge.find(
    (entry) => entry.platform === platform,
  );
  const runtimeStatus = context.gateway?.runtimeStatus();
  const runtimeInventory = runtimeStatus?.transportInventory.find(
    (entry) => entry.platform === platform,
  );
  const gatewayDetail = context.gateway
    ? await context.gateway.transport(platform)
    : undefined;
  const messagingPlugins = groupNativePluginCatalog(
    getNativePluginCatalog(context.config),
  ).messaging;
  const nativePlugin = messagingPlugins.find(
    (entry) =>
      entry.id ===
      (gatewayDetail?.platformState?.nativePluginId ??
        inventory?.pluginId ??
        bridge?.pluginId),
  );

  return {
    platform,
    inventory,
    bridge,
    runtime: runtimeStatus
      ? {
          transportInventory: runtimeInventory,
          transportControl: runtimeStatus.transportControl,
          messagingBridge: runtimeStatus.messagingBridge.find(
            (entry) => entry.platform === platform,
          ),
        }
      : undefined,
    gateway: context.gateway
      ? {
          detail: gatewayDetail,
          health: gatewayDetail?.readiness,
          state: gatewayDetail?.platformState,
          summary: gatewayDetail?.summary,
          history: gatewayDetail
            ? {
                traces: gatewayDetail.recentTraces,
                inbox: gatewayDetail.recentInbox,
                outbox: gatewayDetail.recentOutbox,
                attachments: gatewayDetail.recentAttachments,
              }
            : undefined,
        }
      : undefined,
    plugin: nativePlugin,
    controlPlane,
  };
}

export function formatTransportDrilldown(
  drilldown: TransportDrilldown,
): string {
  const {
    platform,
    inventory,
    bridge,
    runtime,
    gateway,
    plugin,
    controlPlane,
  } = drilldown;

  if (!inventory) {
    return `Transport ${platform} was not found in the canonical inventory.`;
  }

  return [
    `{bold}Transport Drill-Down{/} ${platform}`,
    `Inventory: source=${inventory.source} config=${inventory.configEnabled} gateway=${inventory.gatewayEnabled} operational=${inventory.operational} reason=${inventory.reason}`,
    `Detail: ${inventory.detail}`,
    `Plugin: ${formatTransportField(inventory.pluginId)} service=${formatTransportField(inventory.serviceName)} available=${formatTransportField(inventory.serviceAvailable)}`,
    bridge
      ? `Bridge: config=${bridge.configEnabled} gateway=${bridge.gatewayEnabled} service=${formatTransportField(bridge.serviceName)} available=${formatTransportField(bridge.serviceAvailable)} live=${bridge.live} plugin=${formatTransportField(bridge.pluginId)} reason=${bridge.reason}`
      : "Bridge: n/a",
    runtime
      ? `Runtime control: operational=${runtime.transportControl.operationalTransports}/${controlPlane.transportInventory.length} live=${runtime.transportControl.liveServices}/${runtime.transportControl.gatewayEnabled} pluginEnabled=${runtime.transportControl.enabledPlugins}`
      : "Runtime control: n/a",
    runtime?.transportInventory
      ? `Runtime inventory: source=${runtime.transportInventory.source} config=${runtime.transportInventory.configEnabled} gateway=${runtime.transportInventory.gatewayEnabled} operational=${runtime.transportInventory.operational} reason=${runtime.transportInventory.reason}`
      : "Runtime inventory: n/a",
    gateway?.health
      ? `Gateway health: status=${gateway.health.status} ready=${gateway.health.ready} mode=${gateway.health.mode} sends=${formatTransportField(gateway.health.sendCount)} detail=${gateway.health.detail}`
      : "Gateway health: n/a",
    gateway?.state
      ? `Gateway state: transportState=${gateway.state.transportState} presence=${gateway.state.presence.status} send=${gateway.state.sendCount} recv=${gateway.state.receiveCount} route=${gateway.state.routeCount} resp=${gateway.state.respondCount} traces=${gateway.state.traceCount}`
      : "Gateway state: n/a",
    gateway?.summary ? `Summary: ${gateway.summary}` : "Summary: n/a",
    gateway?.state?.lastEventKind
      ? `Last event: ${gateway.state.lastEventKind} :: ${gateway.state.lastEventDetail ?? "n/a"}`
      : "Last event: n/a",
    gateway?.detail
      ? `History: traces=${gateway.detail.traceCount} inbox=${gateway.detail.inboxCount} outbox=${gateway.detail.outboxCount} attachments=${gateway.detail.attachmentCount}`
      : "History: n/a",
    gateway?.detail
      ? `Mismatches: ${gateway.detail.mismatchFlags.length ? gateway.detail.mismatchFlags.join(", ") : "none"}`
      : "Mismatches: n/a",
    plugin
      ? `Native plugin: ${plugin.id} source=${plugin.source} enabled=${plugin.enabled} :: ${plugin.notes}`
      : "Native plugin: n/a",
  ].join("\n");
}
