import { parseGatewayFiltersFromUrl } from "@/gateway/control/index";
import type { AppContext } from "@/runtime/bootstrap";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog";
import { getNativeOwnershipControlPlane } from "@/runtime/native/service-bridge/ownership";

function buildGatewaySummaryBlock(input: {
  headline: string;
  detail: string;
  nextActions: string[];
}) {
  return input;
}

function describeGatewayHealthCounts(readiness: unknown): {
  configured: number;
  ready: number;
} {
  if (!Array.isArray(readiness)) {
    const ready =
      readiness &&
      typeof readiness === "object" &&
      "ready" in readiness &&
      (readiness as { ready?: boolean }).ready
        ? 1
        : 0;
    return { configured: 1, ready };
  }

  return {
    configured: readiness.length,
    ready: readiness.filter(
      (entry) =>
        entry && typeof entry === "object" && "ready" in entry && entry.ready,
    ).length,
  };
}

export async function buildGatewayHealthResponse(context: AppContext) {
  const readiness = await context.gateway.health();
  const history = await context.gateway.history(25);
  const ownership =
    context.services.nativeOwnership.controlPlane() ??
    getNativeOwnershipControlPlane(
      context.runtime,
      context.services,
      context.config,
      context.services.gatewayConfig,
    );
  const messagingPlugins =
    groupNativePluginCatalog(getNativePluginCatalog(context.config)).messaging ??
    [];
  const counts = describeGatewayHealthCounts(readiness);
  const sessions = context.services.gatewaySessions.list();

  return {
    summary: buildGatewaySummaryBlock({
      headline:
        counts.ready > 0
          ? "Gateway health is live and at least one transport is ready."
          : "Gateway health is available, but no transport is reporting ready yet.",
      detail: `ready=${counts.ready}/${counts.configured} sessions=${sessions.length} traces=${history.traces.length} deliveries=${history.deliveries.length}`,
      nextActions: [
        counts.ready > 0
          ? "Use `GET /gateway/runtime` or `/gateway runtime` for a runtime-first view."
          : "Start the gateway or inspect `/gateway readiness` before expecting live delivery.",
        "Use `GET /gateway/journal` if you need the raw activity feeds.",
      ],
    }),
    health: readiness,
    readiness,
    messagingBridge: ownership.transportControl.messagingBridge,
    transportInventory: ownership.transportControl.transportInventory,
    transportControl: ownership.transportControl.totals,
    ownership: {
      pluginManager: ownership.pluginManager,
      identity: ownership.identity,
    },
    mediation: {
      pluginMediatedAdapters: history.state.totals.pluginMediatedAdapters,
      officialPluginAdapters: history.state.totals.officialPluginAdapters,
      vendoredPluginAdapters: history.state.totals.vendoredPluginAdapters,
    },
    messagingPlugins,
    state: history.state,
    traces: history.traces,
    inbox: history.inbox,
    outbox: history.outbox,
    attachments: history.attachments,
    deliveries: history.deliveries,
    sessions,
  };
}

export function buildGatewayRuntimeResponse(context: AppContext) {
  const runtimeStatus = context.gateway.runtimeStatus();
  const messagingPlugins =
    groupNativePluginCatalog(getNativePluginCatalog(context.config)).messaging ??
    [];
  return {
    summary: buildGatewaySummaryBlock({
      headline: runtimeStatus.daemon?.watchdog?.running
        ? "Gateway runtime is attached and the daemon is running."
        : "Gateway runtime is attached, but the daemon is not running yet.",
      detail: `configured=${runtimeStatus.transportControl?.configured ?? runtimeStatus.transportInventory?.length ?? 0} live=${runtimeStatus.transportControl?.liveServices ?? 0} messagingPlugins=${messagingPlugins.length}`,
      nextActions: [
        runtimeStatus.daemon?.watchdog?.running
          ? "Use `GET /gateway/health` or `/gateway readiness` for transport health."
          : "Start the gateway before expecting live transport continuity.",
      ],
    }),
    runtime: runtimeStatus,
    messagingBridge: runtimeStatus.messagingBridge,
    transportInventory: runtimeStatus.transportInventory,
    transportControl: runtimeStatus.transportControl,
    messagingPlugins,
  };
}

export function buildGatewayDaemonResponse(context: AppContext) {
  const runtimeStatus = context.gateway.runtimeStatus();
  return {
    summary: buildGatewaySummaryBlock({
      headline: runtimeStatus.daemon?.watchdog?.running
        ? "Gateway daemon is running."
        : "Gateway daemon is not running.",
      detail: `configured=${runtimeStatus.transportControl?.configured ?? runtimeStatus.transportInventory?.length ?? 0} live=${runtimeStatus.transportControl?.liveServices ?? 0}`,
      nextActions: [
        runtimeStatus.daemon?.watchdog?.running
          ? "Use `GET /gateway/health` for transport health."
          : "Start the gateway before relying on daemon-backed messaging routes.",
      ],
    }),
    daemon: runtimeStatus.daemon,
    runtime: runtimeStatus,
  };
}

export async function buildGatewayJournalResponse(
  context: AppContext,
  url: URL,
) {
  const filters = parseGatewayFiltersFromUrl(url);
  const traces = context.gateway.trace(filters.limit, filters);
  const inbox = context.gateway.inbox(filters.limit, filters);
  const outbox = context.gateway.outbox(filters.limit, filters);
  const attachments = context.gateway.attachments(filters.limit, filters);
  const supervision = context.gateway.supervision(filters.limit);
  return {
    summary: buildGatewaySummaryBlock({
      headline: "Gateway journal feeds are available.",
      detail: `limit=${filters.limit} traces=${traces.length} inbox=${inbox.length} outbox=${outbox.length} attachments=${attachments.length} supervision=${supervision.length}`,
      nextActions: [
        "Use `GET /gateway/history` for the combined raw gateway payload.",
        "Use `GET /gateway/trace` or `GET /gateway/deliveries` for focused feeds.",
      ],
    }),
    traces,
    inbox,
    outbox,
    attachments,
    supervision,
  };
}
