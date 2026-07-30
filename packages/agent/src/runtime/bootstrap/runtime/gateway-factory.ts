import { DOOLITTLE_GATEWAY_SERVICE } from "@doolittle/contracts";
import type { AgentRuntime } from "@elizaos/core";
import type { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";

export function createGatewayAccessor(params: {
  services: AppServices;
  runtime: AgentRuntime;
}): { get(): GatewayRunner } {
  const { services, runtime } = params;
  const gatewayService = runtime.getService(DOOLITTLE_GATEWAY_SERVICE) as {
    runner?: GatewayRunner;
    ensureRunner?: () => GatewayRunner;
  } | null;
  const ensureRunner = gatewayService?.ensureRunner?.bind(gatewayService);
  if (!ensureRunner) {
    throw new Error(
      `Required Eliza service ${DOOLITTLE_GATEWAY_SERVICE} is unavailable.`,
    );
  }
  let gatewayInstance = gatewayService?.runner;

  return {
    get(): GatewayRunner {
      if (!gatewayInstance) {
        services.startupState.markWarming(
          "gateway",
          "preparing messaging gateway",
        );
        gatewayInstance = ensureRunner();
        services.startupState.markReady("gateway", "gateway runner ready");
      }
      return gatewayInstance;
    },
  };
}
