import type { AppContext } from "@/runtime/bootstrap";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog";
import { getNativeTransportControlPlane } from "@/runtime/native/service-bridge/transport-control";
import type { PlatformName } from "@/types/gateway";

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
