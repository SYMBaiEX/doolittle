import type { AgentRuntime } from "@elizaos/core";
import { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";

export function createGatewayAccessor(params: {
  config: EnvConfig;
  services: AppServices;
  runtime: AgentRuntime;
}): { get(): GatewayRunner } {
  const { config, services, runtime } = params;
  const gatewayService = runtime.getService("doolittle_gateway") as {
    runner?: GatewayRunner;
    ensureRunner?: () => GatewayRunner;
  } | null;
  let gatewayInstance = gatewayService?.runner;

  return {
    get(): GatewayRunner {
      if (!gatewayInstance) {
        services.startupState.markWarming(
          "gateway",
          "preparing messaging gateway",
        );
        gatewayInstance =
          gatewayService?.ensureRunner?.() ??
          new GatewayRunner({
            config,
            services,
            runtime,
          });
        services.startupState.markReady("gateway", "gateway runner ready");
      }
      return gatewayInstance;
    },
  };
}
