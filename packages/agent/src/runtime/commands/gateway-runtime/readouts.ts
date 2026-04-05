import {
  buildTransportDrilldown,
  formatTransportDrilldown,
  parseGatewayFiltersFromText,
  parseTransportPlatform,
} from "@/gateway/control/index";
import { summarizeTransportInventory } from "@/gateway/transport";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog/index";
import { getNativeTransportControlPlane } from "@/runtime/native/service-bridge/index";
import type { ChatTurnRequest } from "@/types/runtime";

import type { AppContext } from "../../bootstrap";
import type { AgentExecutionContext } from "../../chat";

export async function handleGatewayRuntimeReadoutCommand(
  _input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/gateway readiness") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const health = await context.gateway.health();
    const controlPlane = getNativeTransportControlPlane(
      context.runtime,
      context.config,
      context.services.gatewayConfig,
    );
    const pluginLines = groupNativePluginCatalog(
      getNativePluginCatalog(context.config),
    ).messaging.map(
      (entry) =>
        `- plugin ${entry.id} [${entry.enabled ? "enabled" : "disabled"}] source=${entry.source} :: ${entry.notes}`,
    );
    const bridgeLines = controlPlane.messagingBridge.map(
      (entry) =>
        `- bridge ${entry.platform} config=${entry.configEnabled} gateway=${entry.gatewayEnabled} service=${entry.serviceName} available=${entry.serviceAvailable} live=${entry.live} plugin=${entry.pluginId ?? "n/a"} reason=${entry.reason} :: ${entry.detail}`,
    );
    const transportLines = controlPlane.transportInventory
      .filter(
        (entry) =>
          entry.platform !== "telegram" && entry.platform !== "discord",
      )
      .map(
        (entry) =>
          `- transport ${entry.platform} source=${entry.source} config=${entry.configEnabled} gateway=${entry.gatewayEnabled} op=${entry.operational} reason=${entry.reason} :: ${entry.detail}`,
      );
    return [
      `gateway totals: configured=${health.length} ready=${health.filter((entry) => entry.ready).length} pluginMediated=${health.filter((entry) => entry.nativePluginId).length} official=${health.filter((entry) => entry.nativePluginSource === "official").length} vendored=${health.filter((entry) => entry.nativePluginSource === "vendored").length}`,
      `bridge totals: gatewayEnabled=${controlPlane.totals.gatewayEnabled} pluginEnabled=${controlPlane.totals.enabledPlugins} available=${controlPlane.totals.availableServices} live=${controlPlane.totals.liveServices} operational=${controlPlane.totals.operationalTransports}`,
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
      ...pluginLines,
    ].join("\n");
  }

  if (trimmed === "/transport inventory" || trimmed === "/gateway transports") {
    const controlPlane = getNativeTransportControlPlane(
      context.runtime,
      context.config,
      context.services.gatewayConfig,
    );
    return summarizeTransportInventory(controlPlane.transportInventory, "chat");
  }

  if (trimmed === "/transport status") {
    const controlPlane = getNativeTransportControlPlane(
      context.runtime,
      context.config,
      context.services.gatewayConfig,
    );
    return [
      `transport status: operational=${controlPlane.totals.operationalTransports}/${controlPlane.transportInventory.length} live=${controlPlane.totals.liveServices} gatewayEnabled=${controlPlane.totals.gatewayEnabled} pluginEnabled=${controlPlane.totals.enabledPlugins}`,
      `native services: available=${controlPlane.totals.availableServices} product=${controlPlane.totals.productTransports} custom=${controlPlane.totals.customTransports}`,
      summarizeTransportInventory(controlPlane.transportInventory, "chat"),
    ].join("\n");
  }

  if (trimmed === "/transport mismatches") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const overview = await context.gateway.transportOverview();
    const mismatches = overview.details.filter(
      (entry) => entry.mismatchFlags.length > 0,
    );
    return [
      `transport mismatch summary: mismatches=${overview.mismatchCount} operational=${overview.operationalCount}/${overview.details.length}`,
      ...(mismatches.length
        ? mismatches.map(
            (entry) =>
              `- ${entry.platform} :: ${entry.mismatchFlags.join(", ")} :: ${entry.inventory?.detail ?? entry.platformState?.detail ?? "n/a"}`,
          )
        : ["- none"]),
    ].join("\n");
  }

  if (
    trimmed.startsWith("/transport show ") ||
    trimmed.startsWith("/gateway transport show ") ||
    trimmed.startsWith("/transport ") ||
    trimmed.startsWith("/gateway transport ")
  ) {
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
      await buildTransportDrilldown(context as AppContext, platform),
    );
  }

  if (trimmed === "/platforms" || trimmed === "/platforms status") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const state = await context.gateway.state(50);
    const messagingCatalog = groupNativePluginCatalog(
      getNativePluginCatalog(context.config),
    ).messaging;
    const totals = [
      `configured=${state.totals.configuredPlatforms}`,
      `ready=${state.totals.readyAdapters}`,
      `pluginMediated=${state.totals.pluginMediatedAdapters}`,
      `official=${state.totals.officialPluginAdapters}`,
      `vendored=${state.totals.vendoredPluginAdapters}`,
    ].join(" ");
    const controlPlane = getNativeTransportControlPlane(
      context.runtime,
      context.config,
      context.services.gatewayConfig,
    );
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
    const pluginLines = messagingCatalog.map(
      (entry) =>
        `- plugin ${entry.id} [${entry.enabled ? "enabled" : "disabled"}] source=${entry.source} :: ${entry.notes}`,
    );
    const inventoryLines = controlPlane.transportInventory.map(
      (entry) =>
        `- inventory ${entry.platform} source=${entry.source} config=${entry.configEnabled} gateway=${entry.gatewayEnabled} op=${entry.operational} reason=${entry.reason}`,
    );
    return [
      `platform totals: ${totals}`,
      ...platformLines,
      ...inventoryLines,
      ...pluginLines,
    ].join("\n");
  }

  if (trimmed === "/gateway state" || trimmed.startsWith("/gateway state ")) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const filters = parseGatewayFiltersFromText(
      trimmed.replace("/gateway state", "").trim(),
    );
    return JSON.stringify(
      await context.gateway.state(filters.limit ?? 20, filters),
      null,
      2,
    );
  }

  if (trimmed === "/gateway runtime") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const state = await context.gateway.state(50);
    const runtimeStatus = context.gateway.runtimeStatus();
    return JSON.stringify(
      {
        runtime: runtimeStatus,
        messagingBridge: runtimeStatus.messagingBridge,
        transportInventory: runtimeStatus.transportInventory,
        transportControl: runtimeStatus.transportControl,
        mediation: {
          pluginMediatedAdapters: state.totals.pluginMediatedAdapters,
          officialPluginAdapters: state.totals.officialPluginAdapters,
          vendoredPluginAdapters: state.totals.vendoredPluginAdapters,
        },
        messagingPlugins: groupNativePluginCatalog(
          getNativePluginCatalog(context.config),
        ).messaging,
      },
      null,
      2,
    );
  }

  if (trimmed === "/gateway daemon") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const runtime = context.gateway.runtimeStatus();
    return JSON.stringify(
      {
        runtime,
        daemon: runtime.daemon,
      },
      null,
      2,
    );
  }

  return undefined;
}
