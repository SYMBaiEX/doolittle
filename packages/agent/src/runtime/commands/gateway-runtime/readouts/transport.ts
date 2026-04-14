import {
  buildTransportDrilldown,
  formatTransportDrilldown,
  parseTransportPlatform,
} from "@/gateway/control/index";
import { summarizeTransportInventory } from "@/gateway/transport";
import type { AgentExecutionContext } from "../../../chat";
import {
  asAppContext,
  describeGatewayRuntimeSnapshot,
  GATEWAY_UNAVAILABLE_MESSAGE,
  getMessagingPluginLines,
  getTransportControlPlane,
  renderGatewayOperatorBlock,
} from "./shared";
import type { GatewayRuntimeReadoutHandler } from "./types";

function handleTransportInventoryReadout(
  trimmed: string,
  context: AgentExecutionContext,
): string | undefined {
  if (trimmed !== "/transport inventory" && trimmed !== "/gateway transports") {
    return undefined;
  }
  const controlPlane = getTransportControlPlane(context);
  return renderGatewayOperatorBlock(
    "Transport Inventory",
    [
      `Configured: ${controlPlane.transportInventory.length}`,
      summarizeTransportInventory(controlPlane.transportInventory, "chat"),
    ],
    ["Use `/transport show <platform>` for a full drill-down."],
  );
}

function handleTransportStatusReadout(
  trimmed: string,
  context: AgentExecutionContext,
): string | undefined {
  if (trimmed !== "/transport status") {
    return undefined;
  }
  const controlPlane = getTransportControlPlane(context);
  return renderGatewayOperatorBlock(
    "Transport Status",
    [
      `Runtime: operational=${controlPlane.totals.operationalTransports}/${controlPlane.transportInventory.length} live=${controlPlane.totals.liveServices} gatewayEnabled=${controlPlane.totals.gatewayEnabled} pluginEnabled=${controlPlane.totals.enabledPlugins}`,
      `Services: available=${controlPlane.totals.availableServices} product=${controlPlane.totals.productTransports} custom=${controlPlane.totals.customTransports}`,
      summarizeTransportInventory(controlPlane.transportInventory, "chat"),
    ],
    [
      "Use `/gateway readiness` for gateway-side health.",
      "Use `/transport show <platform>` when a single transport looks wrong.",
    ],
  );
}

async function handleGatewayReadinessReadout(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed !== "/gateway readiness") {
    return undefined;
  }
  if (!context.gateway) {
    return GATEWAY_UNAVAILABLE_MESSAGE;
  }
  const health = await context.gateway.health();
  const controlPlane = getTransportControlPlane(context);
  const snapshot = describeGatewayRuntimeSnapshot(context);
  const bridgeLines = controlPlane.messagingBridge.map(
    (entry) =>
      `- bridge ${entry.platform} config=${entry.configEnabled} gateway=${entry.gatewayEnabled} service=${entry.serviceName} available=${entry.serviceAvailable} live=${entry.live} plugin=${entry.pluginId ?? "n/a"} reason=${entry.reason} :: ${entry.detail}`,
  );
  const transportLines = controlPlane.transportInventory
    .filter(
      (entry) => entry.platform !== "telegram" && entry.platform !== "discord",
    )
    .map(
      (entry) =>
        `- transport ${entry.platform} source=${entry.source} config=${entry.configEnabled} gateway=${entry.gatewayEnabled} op=${entry.operational} reason=${entry.reason} :: ${entry.detail}`,
    );

  return renderGatewayOperatorBlock(
    "Gateway Readiness",
    [
      `Gateway: configured=${health.length} ready=${health.filter((entry) => entry.ready).length} pluginMediated=${health.filter((entry) => entry.nativePluginId).length} official=${health.filter((entry) => entry.nativePluginSource === "official").length} vendored=${health.filter((entry) => entry.nativePluginSource === "vendored").length}`,
      `Bridge: gatewayEnabled=${controlPlane.totals.gatewayEnabled} pluginEnabled=${controlPlane.totals.enabledPlugins} available=${controlPlane.totals.availableServices} live=${controlPlane.totals.liveServices} operational=${controlPlane.totals.operationalTransports}`,
      ...health.map((entry) => {
        const lifecycle = [
          entry.startedAt ? `started=${entry.startedAt}` : undefined,
          entry.stoppedAt ? `stopped=${entry.stoppedAt}` : undefined,
          entry.lastSendAt ? `lastSend=${entry.lastSendAt}` : undefined,
          entry.sendCount !== undefined
            ? `sends=${entry.sendCount}`
            : undefined,
          entry.lastError ? `error=${entry.lastError}` : undefined,
          `events=${entry.events.length}`,
          entry.events[0] ? `lastEvent=${entry.events[0].kind}` : undefined,
          entry.nativePluginId ? `plugin=${entry.nativePluginId}` : undefined,
          entry.nativePluginSource
            ? `pluginSource=${entry.nativePluginSource}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" ");
        return `- ${entry.platform} [${entry.status}] ready=${entry.ready} mode=${entry.mode} inbound=${entry.capabilities.inbound} outbound=${entry.capabilities.outbound} edits=${entry.capabilities.edits}${lifecycle ? ` ${lifecycle}` : ""} :: ${entry.detail}`;
      }),
      ...bridgeLines,
      ...transportLines,
      ...getMessagingPluginLines(context),
    ],
    [
      snapshot.daemonRunning
        ? "Use `/gateway watch <platform>` or `/gateway restart <platform>` when a transport is unhealthy."
        : "Start the gateway before expecting readiness to improve.",
      "Use `/transport mismatches` to compare inventory and live gateway state.",
    ],
  );
}

async function handleTransportMismatchReadout(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed !== "/transport mismatches") {
    return undefined;
  }
  if (!context.gateway) {
    return GATEWAY_UNAVAILABLE_MESSAGE;
  }
  const overview = await context.gateway.transportOverview();
  const mismatches = overview.details.filter(
    (entry) => entry.mismatchFlags.length > 0,
  );
  return renderGatewayOperatorBlock(
    "Transport Mismatches",
    [
      `Mismatch summary: ${overview.mismatchCount} mismatch(es), operational=${overview.operationalCount}/${overview.details.length}`,
      ...(mismatches.length
        ? mismatches.map(
            (entry) =>
              `- ${entry.platform} :: ${entry.mismatchFlags.join(", ")} :: ${entry.inventory?.detail ?? entry.platformState?.detail ?? "n/a"}`,
          )
        : ["- none"]),
    ],
    [
      mismatches.length
        ? "Run `/transport show <platform>` on the mismatched transport before restarting anything."
        : "No mismatch-specific follow-up is needed right now.",
    ],
  );
}

async function handleTransportShowReadout(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (
    !trimmed.startsWith("/transport show ") &&
    !trimmed.startsWith("/gateway transport show ") &&
    !trimmed.startsWith("/transport ") &&
    !trimmed.startsWith("/gateway transport ")
  ) {
    return undefined;
  }

  const rawPlatform = trimmed
    .replace(/^\/gateway\s+transport\s+show\s+/u, "")
    .replace(/^\/transport\s+show\s+/u, "")
    .replace(/^\/gateway\s+transport\s+/u, "")
    .replace(/^\/transport\s+/u, "")
    .trim();
  const platform = parseTransportPlatform(rawPlatform);
  if (!platform) {
    return "Usage: /transport show <platform>";
  }

  return formatTransportDrilldown(
    await buildTransportDrilldown(asAppContext(context), platform),
  );
}

const TRANSPORT_HANDLERS: GatewayRuntimeReadoutHandler[] = [
  handleGatewayReadinessReadout,
  async (trimmed, context) => handleTransportInventoryReadout(trimmed, context),
  async (trimmed, context) => handleTransportStatusReadout(trimmed, context),
  handleTransportMismatchReadout,
  handleTransportShowReadout,
];

export async function handleTransportReadout(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  for (const handler of TRANSPORT_HANDLERS) {
    const result = await handler(trimmed, context);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}
