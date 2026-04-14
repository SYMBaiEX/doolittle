import {
  buildTransportDrilldown,
  parseTransportPlatform,
} from "@/gateway/control/index";
import type { AppContext } from "@/runtime/bootstrap";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog";
import { getNativeIntegrationControlPlane } from "@/runtime/native/service-bridge/control-planes";
import {
  getNativeOwnershipControlPlane,
  getNativeOwnershipSnapshot,
} from "@/runtime/native/service-bridge/ownership";
import { getNativeTransportControlPlane } from "@/runtime/native/service-bridge/transport-control";
import { json } from "@/server/responses";

export async function handleTransportRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/platforms") {
    if (!context.gateway) {
      return json(
        {
          error: "Gateway runtime is not attached to this execution context.",
        },
        503,
      );
    }
    const state = await context.gateway.state(50);
    const controlPlane = getNativeTransportControlPlane(
      context.runtime,
      context.config,
      context.services.gatewayConfig,
    );
    return json({
      totals: state.totals,
      platforms: state.platforms,
      messagingBridge: controlPlane.messagingBridge,
      transportInventory: controlPlane.transportInventory,
      transportControl: controlPlane.totals,
      messagingPlugins: groupNativePluginCatalog(
        getNativePluginCatalog(context.config),
      ).messaging,
    });
  }

  if (request.method === "GET" && url.pathname === "/runtime/services") {
    const ownership =
      context.services.nativeOwnership.controlPlane() ??
      getNativeOwnershipControlPlane(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
      );
    const integration = await getNativeIntegrationControlPlane(
      context.runtime,
      {
        web: context.services.web,
        mcp: context.services.mcp,
      },
    );
    return json({
      resolution: ownership.serviceResolution,
      integration,
      messagingBridge: ownership.transportControl.messagingBridge,
      transportInventory: ownership.transportControl.transportInventory,
      transportControl: ownership.transportControl.totals,
      ownership: {
        pluginManager: ownership.pluginManager,
        identity: ownership.identity,
      },
      registry: context.services.nativeRegistry,
    });
  }

  if (request.method === "GET" && url.pathname === "/runtime/ownership") {
    return json(
      (await context.services.nativeOwnership.snapshot()) ??
        (await getNativeOwnershipSnapshot(
          context.runtime,
          context.services,
          context.config,
          context.services.gatewayConfig,
        )),
    );
  }

  if (request.method === "GET" && url.pathname === "/runtime/transports") {
    return json(
      getNativeTransportControlPlane(
        context.runtime,
        context.config,
        context.services.gatewayConfig,
      ),
    );
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/transport/inventory" ||
      url.pathname === "/transport/status" ||
      url.pathname === "/gateway/transports")
  ) {
    return json(
      getNativeTransportControlPlane(
        context.runtime,
        context.config,
        context.services.gatewayConfig,
      ),
    );
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/transport/mismatches" ||
      url.pathname === "/gateway/transport-mismatches")
  ) {
    if (!context.gateway) {
      return json(
        {
          error: "Gateway runtime is not attached to this execution context.",
        },
        503,
      );
    }
    return json(await context.gateway.transportOverview());
  }

  if (
    request.method === "GET" &&
    (url.pathname.startsWith("/transport/") ||
      url.pathname.startsWith("/gateway/transport/"))
  ) {
    const rawPlatform = url.pathname
      .replace(/^\/gateway\/transport\//u, "")
      .replace(/^\/transport\//u, "");
    const platform = parseTransportPlatform(rawPlatform);
    if (!platform) {
      return json({ error: "Unknown transport platform." }, 404);
    }
    return json(await buildTransportDrilldown(context, platform));
  }

  return null;
}
