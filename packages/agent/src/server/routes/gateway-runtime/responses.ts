import { parseGatewayFiltersFromUrl } from "@/gateway/control/index";
import type { AppContext } from "@/runtime/bootstrap";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog/index";
import { getNativeOwnershipControlPlane } from "@/runtime/native/service-bridge/index";

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

  return {
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
    messagingPlugins: groupNativePluginCatalog(
      getNativePluginCatalog(context.config),
    ).messaging,
    state: history.state,
    traces: history.traces,
    inbox: history.inbox,
    outbox: history.outbox,
    attachments: history.attachments,
    deliveries: history.deliveries,
    sessions: context.services.gatewaySessions.list(),
  };
}

export function buildGatewayRuntimeResponse(context: AppContext) {
  const runtimeStatus = context.gateway.runtimeStatus();
  return {
    runtime: runtimeStatus,
    messagingBridge: runtimeStatus.messagingBridge,
    transportInventory: runtimeStatus.transportInventory,
    transportControl: runtimeStatus.transportControl,
    messagingPlugins: groupNativePluginCatalog(
      getNativePluginCatalog(context.config),
    ).messaging,
  };
}

export function buildGatewayDaemonResponse(context: AppContext) {
  const runtimeStatus = context.gateway.runtimeStatus();
  return {
    daemon: runtimeStatus.daemon,
    runtime: runtimeStatus,
  };
}

export async function buildGatewayJournalResponse(
  context: AppContext,
  url: URL,
) {
  const filters = parseGatewayFiltersFromUrl(url);
  return {
    traces: context.gateway.trace(filters.limit, filters),
    inbox: context.gateway.inbox(filters.limit, filters),
    outbox: context.gateway.outbox(filters.limit, filters),
    attachments: context.gateway.attachments(filters.limit, filters),
    supervision: context.gateway.supervision(filters.limit),
  };
}
