import { truncate } from "@/cli/text-utils";
import { summarizeTransportInventory } from "@/gateway/transport";
import type { AppContext } from "@/runtime/bootstrap";

export async function renderTransportContent(
  context: AppContext,
): Promise<string> {
  const traces = context.gateway.trace(6);
  const inbox = context.gateway.inbox(3);
  const sessions = context.services.gatewaySessions.list().slice(0, 4);
  const runtimeStatus = context.gateway.runtimeStatus();
  const gatewayState = await context.gateway.state(12);
  const platformStates = gatewayState.platforms.slice(0, 4);
  const inventorySummary = summarizeTransportInventory(
    runtimeStatus.transportInventory,
    "cli",
  ).split("\n");

  return [
    "{bold}Canonical Transport Inventory{/}",
    `Live: ${runtimeStatus.transportControl.liveServices}/${runtimeStatus.transportControl.gatewayEnabled}`,
    `Operational: ${runtimeStatus.transportControl.operationalTransports}/${runtimeStatus.transportInventory.length}`,
    `Configured: ${gatewayState.totals.configuredPlatforms}  plugin-mediated: ${gatewayState.totals.pluginMediatedAdapters}`,
    `Sources: official=${runtimeStatus.transportControl.officialPlugins} custom=${runtimeStatus.transportControl.customTransports} product=${runtimeStatus.transportControl.productTransports}`,
    ...(inventorySummary.length ? ["", ...inventorySummary.slice(0, 2)] : []),
    "",
    "{bold}Recent Trace{/}",
    ...(traces.length
      ? traces.map(
          (trace) =>
            `:: ${trace.platform}:${trace.kind} ${truncate(trace.detail ?? trace.traceId, 34)}`,
        )
      : ["{gray-fg}No recent trace activity.{/}"]),
    "",
    "{bold}Platforms{/}",
    ...(platformStates.length
      ? platformStates.map(
          (entry) =>
            `- ${entry.platform} ${entry.transportState} ${entry.presence.status}${entry.nativePluginId ? ` plugin=${entry.nativePluginId}` : ""}`,
        )
      : ["{gray-fg}No enabled platform state yet.{/}"]),
    "",
    "{bold}Recent Inbox{/}",
    ...(inbox.length
      ? inbox.map(
          (entry) => `>> ${entry.platform} ${truncate(entry.textPreview, 32)}`,
        )
      : ["{gray-fg}No inbound messages recorded.{/}"]),
    "",
    "{bold}Gateway Sessions{/}",
    ...(sessions.length
      ? sessions.map(
          (entry) =>
            `- ${entry.platform} ${truncate(entry.roomId ?? entry.sessionKey, 26)}${
              entry.voiceMode ? " {cyan-fg}[voice]{/}" : ""
            }`,
        )
      : ["{gray-fg}No active gateway sessions.{/}"]),
  ].join("\n");
}
