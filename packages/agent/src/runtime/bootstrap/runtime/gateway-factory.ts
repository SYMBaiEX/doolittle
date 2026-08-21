import { DOOLITTLE_GATEWAY_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime } from "@elizaos/core";
import type { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";
import { requireRuntimeService } from "./required-service";

export function createGatewayAccessor(params: {
  services: AppServices;
  runtime: IAgentRuntime;
}): {
  get(): GatewayRunner;
  setDeferredHydration(
    ensureDeferredHydration: (reason?: string) => Promise<void>,
  ): void;
} {
  const { services, runtime } = params;
  let gatewayInstance: GatewayRunner | undefined;
  let ensureDeferredHydration: ((reason?: string) => Promise<void>) | undefined;

  const bindDeferredHydration = (runner: GatewayRunner): GatewayRunner => {
    if (ensureDeferredHydration) {
      runner.setDeferredHydration(ensureDeferredHydration);
    }
    return runner;
  };

  return {
    get(): GatewayRunner {
      if (!gatewayInstance) {
        const gatewayService = requireRuntimeService<{
          runner?: GatewayRunner;
          ensureRunner(): GatewayRunner;
        }>(runtime, DOOLITTLE_GATEWAY_SERVICE, ["ensureRunner"]);
        gatewayInstance = gatewayService.runner;
        if (gatewayInstance) return bindDeferredHydration(gatewayInstance);
        services.startupState.markWarming(
          "gateway",
          "preparing messaging gateway",
        );
        gatewayInstance = gatewayService.ensureRunner();
        services.startupState.markReady("gateway", "gateway runner ready");
      }
      return bindDeferredHydration(gatewayInstance);
    },
    setDeferredHydration(nextEnsureDeferredHydration): void {
      ensureDeferredHydration = nextEnsureDeferredHydration;
      if (gatewayInstance) {
        gatewayInstance.setDeferredHydration(nextEnsureDeferredHydration);
      }
    },
  };
}
