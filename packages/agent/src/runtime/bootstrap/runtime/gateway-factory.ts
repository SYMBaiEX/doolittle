import { DOOLITTLE_GATEWAY_SERVICE } from "@doolittle/contracts";
import type { AgentRuntime } from "@elizaos/core";
import type { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";
import { requireRuntimeService } from "./required-service";

export function createGatewayAccessor(params: {
  services: AppServices;
  runtime: AgentRuntime;
}): { get(): GatewayRunner } {
  const { services, runtime } = params;
  const gatewayService = requireRuntimeService<{
    runner?: GatewayRunner;
    ensureRunner(): GatewayRunner;
  }>(runtime, DOOLITTLE_GATEWAY_SERVICE, ["ensureRunner"]);
  let gatewayInstance = gatewayService.runner;

  return {
    get(): GatewayRunner {
      if (!gatewayInstance) {
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
