import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog/index";
import {
  getAutonomousControlPlane,
  getNativeEcosystemSnapshot,
  getNativeExecutionControlPlane,
  getNativeIntegrationControlPlane,
  getNativeMediaControlPlane,
  getNativeOwnershipControlPlane,
  getNativeOwnershipSnapshot,
  getNativeResearchControlPlane,
  getNativeTransportControlPlane,
} from "@/runtime/native/service-bridge/index";
import type { AgentExecutionContext } from "../chat";

export async function handleRuntimeIntrospectionCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/runtime plugins" || trimmed === "/plugins native") {
    const catalog = getNativePluginCatalog(context.config);
    const ownership =
      context.services.nativeOwnership.controlPlane() ??
      getNativeOwnershipControlPlane(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
      );
    return JSON.stringify(
      {
        catalog,
        grouped: groupNativePluginCatalog(catalog),
        serviceRegistry: context.services.nativeRegistry,
        pluginManager: ownership.pluginManager,
        ownership: {
          serviceResolution: ownership.serviceResolution,
          identity: ownership.identity,
        },
      },
      null,
      2,
    );
  }

  if (trimmed === "/runtime services" || trimmed === "/services native") {
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
    return JSON.stringify(
      {
        resolution: ownership.serviceResolution,
        integration,
        messaging: ownership.transportControl.messagingBridge,
        transportInventory: ownership.transportControl.transportInventory,
        transportControl: ownership.transportControl.totals,
        ownership: {
          pluginManager: ownership.pluginManager,
          identity: ownership.identity,
        },
        registry: context.services.nativeRegistry,
      },
      null,
      2,
    );
  }

  if (trimmed === "/runtime ownership") {
    return JSON.stringify(
      (await context.services.nativeOwnership.snapshot()) ??
        (await getNativeOwnershipSnapshot(
          context.runtime,
          context.services,
          context.config,
          context.services.gatewayConfig,
        )),
      null,
      2,
    );
  }

  if (trimmed === "/runtime transports") {
    return JSON.stringify(
      getNativeTransportControlPlane(
        context.runtime,
        context.config,
        context.services.gatewayConfig,
      ),
      null,
      2,
    );
  }

  if (
    trimmed === "/runtime ecosystem" ||
    trimmed === "/plugins ecosystem" ||
    trimmed === "/runtime ecosystem refresh"
  ) {
    const refresh = trimmed.endsWith(" refresh");
    return JSON.stringify(
      await getNativeEcosystemSnapshot(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
        refresh,
      ),
      null,
      2,
    );
  }

  if (trimmed === "/ecosystem" || trimmed === "/ecosystem packages") {
    return JSON.stringify(
      await getNativeEcosystemSnapshot(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
      ),
      null,
      2,
    );
  }

  if (trimmed === "/benchmarks packs") {
    return JSON.stringify(
      {
        packs: context.services.ecosystem.benchmarkPacks(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/modeling profiles") {
    return JSON.stringify(
      {
        profiles: context.services.ecosystem.modelingProfiles(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/insights") {
    return JSON.stringify(
      {
        ownership:
          context.services.nativeOwnership.controlPlane() ??
          getNativeOwnershipControlPlane(
            context.runtime,
            context.services,
            context.config,
            context.services.gatewayConfig,
          ),
        ecosystem: await getNativeEcosystemSnapshot(
          context.runtime,
          context.services,
          context.config,
          context.services.gatewayConfig,
        ),
        operator: await context.services.operator.setupSummary(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/runtime autonomous") {
    return JSON.stringify(
      getAutonomousControlPlane(
        context.runtime,
        context.services,
        context.config,
      ),
      null,
      2,
    );
  }

  if (trimmed === "/runtime media") {
    return JSON.stringify(getNativeMediaControlPlane(context.config), null, 2);
  }

  if (trimmed === "/runtime e2b" || trimmed === "/runtime sandboxes") {
    return JSON.stringify(
      getNativeExecutionControlPlane(context.runtime).e2b,
      null,
      2,
    );
  }

  if (trimmed === "/runtime research") {
    return JSON.stringify(
      getNativeResearchControlPlane(context.runtime),
      null,
      2,
    );
  }

  if (trimmed === "/runtime compatibility") {
    return JSON.stringify(
      await context.services.agentSdk.compatibility(),
      null,
      2,
    );
  }

  if (trimmed === "/runtime registry") {
    return JSON.stringify(await context.services.agentSdk.registry(), null, 2);
  }

  if (trimmed === "/runtime registry refresh") {
    return JSON.stringify(
      await context.services.agentSdk.registry(true),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/runtime registry search ")) {
    const query = trimmed.replace("/runtime registry search ", "").trim();
    if (!query) {
      return "Usage: /runtime registry search <query>";
    }
    return JSON.stringify(
      await context.services.agentSdk.searchRegistry(query),
      null,
      2,
    );
  }

  return undefined;
}
