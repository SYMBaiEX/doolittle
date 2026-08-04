import { DOOLITTLE_GATEWAY_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime } from "@elizaos/core";
import type { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";
import { requireRuntimeService } from "./required-service";

export function createGatewayAccessor(params: {
  services: AppServices;
  runtime: IAgentRuntime;
}): { get(): GatewayRunner } {
  const { services, runtime } = params;
  let gatewayInstance: GatewayRunner | undefined;

  return {
    get(): GatewayRunner {
      if (!gatewayInstance) {
        const gatewayService = requireRuntimeService<{
          runner?: GatewayRunner;
          ensureRunner(): GatewayRunner;
        }>(runtime, DOOLITTLE_GATEWAY_SERVICE, ["ensureRunner"]);
        gatewayInstance = gatewayService.runner;
        if (gatewayInstance) return gatewayInstance;
        services.startupState.markWarming(
          "gateway",
          "preparing messaging gateway",
        );
        gatewayInstance = gatewayService.ensureRunner();
        services.startupState.markReady("gateway", "gateway runner ready");
      }
      return gatewayInstance;
    },
  };
}
