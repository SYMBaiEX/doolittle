import { DOOLITTLE_GATEWAY_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime } from "@elizaos/core";
import type { GatewayRunner } from "../../../gateway/runner/index";
import type { AppServices } from "../../../services/index";
import type { AppContext } from "../types";
import { requireRuntimeService } from "./required-service";

export function createGatewayAccessor(params: {
  services: AppServices;
  runtime: IAgentRuntime;
}): {
  get(): GatewayRunner;
  setTurnPluginReadiness(
    ensureTurnPlugins: AppContext["ensureTurnPlugins"],
  ): void;
} {
  const { startupState } = params.services;
  let gatewayInstance: GatewayRunner | undefined;
  let ensureTurnPlugins: AppContext["ensureTurnPlugins"] | undefined;

  return {
    get(): GatewayRunner {
      if (gatewayInstance) return gatewayInstance;
      startupState.markWarming("gateway", "preparing messaging gateway");
      try {
        const gatewayService = requireRuntimeService<{
          ensureRunner(): GatewayRunner;
        }>(params.runtime, DOOLITTLE_GATEWAY_SERVICE, ["ensureRunner"]);
        const runner = gatewayService.ensureRunner();
        if (ensureTurnPlugins) runner.setTurnPluginReadiness(ensureTurnPlugins);
        gatewayInstance = runner;
        startupState.markReady("gateway", "gateway runner ready");
        return runner;
      } catch (error) {
        startupState.markError("gateway", "Messaging gateway could not start.");
        throw error;
      }
    },
    setTurnPluginReadiness(nextEnsureTurnPlugins): void {
      ensureTurnPlugins = nextEnsureTurnPlugins;
      gatewayInstance?.setTurnPluginReadiness(nextEnsureTurnPlugins);
    },
  };
}
