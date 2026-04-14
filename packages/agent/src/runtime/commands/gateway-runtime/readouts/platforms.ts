import { parseGatewayFiltersFromText } from "@/gateway/control/index";
import type { AgentExecutionContext } from "../../../chat";
import {
  GATEWAY_UNAVAILABLE_MESSAGE,
  getMessagingPluginLines,
  getTransportControlPlane,
  renderGatewayOperatorBlock,
} from "./shared";
import type { GatewayRuntimeReadoutHandler } from "./types";

async function handlePlatformsStatusReadout(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed !== "/platforms" && trimmed !== "/platforms status") {
    return undefined;
  }
  if (!context.gateway) {
    return GATEWAY_UNAVAILABLE_MESSAGE;
  }

  const state = await context.gateway.state(50);
  const controlPlane = getTransportControlPlane(context);
  const totals = [
    `configured=${state.totals.configuredPlatforms}`,
    `ready=${state.totals.readyAdapters}`,
    `pluginMediated=${state.totals.pluginMediatedAdapters}`,
    `official=${state.totals.officialPluginAdapters}`,
    `vendored=${state.totals.vendoredPluginAdapters}`,
  ].join(" ");
  const platformLines = state.platforms.map((entry) => {
    const counters = [
      `send=${entry.sendCount}`,
      `recv=${entry.receiveCount}`,
      `route=${entry.routeCount}`,
      `resp=${entry.respondCount}`,
      `events=${entry.eventCount}`,
    ].join(" ");
    return `- ${entry.platform} [${entry.transportState}] ready=${entry.ready} mode=${entry.mode} presence=${entry.presence.status}${entry.nativePluginId ? ` plugin=${entry.nativePluginId}` : ""}${entry.nativePluginSource ? ` source=${entry.nativePluginSource}` : ""}${entry.lastEventKind ? ` last=${entry.lastEventKind}` : ""} ${counters} :: ${entry.detail}`;
  });
  const inventoryLines = controlPlane.transportInventory.map(
    (entry) =>
      `- inventory ${entry.platform} source=${entry.source} config=${entry.configEnabled} gateway=${entry.gatewayEnabled} op=${entry.operational} reason=${entry.reason}`,
  );

  return renderGatewayOperatorBlock(
    "Platform Status",
    [
      `Totals: ${totals}`,
      ...platformLines,
      ...inventoryLines,
      ...getMessagingPluginLines(context),
    ],
    [
      "Use `/gateway state` for the raw state snapshot.",
      "Use `/gateway readiness` when you want transport-by-transport health guidance.",
    ],
  );
}

async function handleGatewayStateReadout(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed !== "/gateway state" && !trimmed.startsWith("/gateway state ")) {
    return undefined;
  }
  if (!context.gateway) {
    return GATEWAY_UNAVAILABLE_MESSAGE;
  }
  const filters = parseGatewayFiltersFromText(
    trimmed.replace("/gateway state", "").trim(),
  );
  const state = await context.gateway.state(filters.limit ?? 20, filters);
  return renderGatewayOperatorBlock(
    "Gateway State",
    [
      `Totals: configured=${state.totals.configuredPlatforms} ready=${state.totals.readyAdapters} traces=${state.totals.totalTraces} inbox=${state.totals.inboxMessages} outbox=${state.totals.outboxMessages}`,
      `Filter: limit=${filters.limit ?? 20}${filters.platform ? ` platform=${filters.platform}` : ""}${filters.kind ? ` kind=${filters.kind}` : ""}${filters.sessionId ? ` session=${filters.sessionId}` : ""}`,
      ...state.platforms
        .slice(0, 8)
        .map(
          (entry) =>
            `- ${entry.platform} [${entry.transportState}] ready=${entry.ready} presence=${entry.presence.status}${entry.lastEventKind ? ` last=${entry.lastEventKind}` : ""} :: ${entry.detail}`,
        ),
    ],
    [
      "Use `/platforms status` for the broader operator view.",
      "Use the HTTP `GET /gateway/state` route if you need the raw structured payload.",
    ],
  );
}

const PLATFORM_HANDLERS: GatewayRuntimeReadoutHandler[] = [
  handlePlatformsStatusReadout,
  handleGatewayStateReadout,
];

export async function handlePlatformReadout(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  for (const handler of PLATFORM_HANDLERS) {
    const result = await handler(trimmed, context);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}
