import { DOOLITTLE_AWARENESS_SERVICE } from "@doolittle/contracts";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Service,
  type ServiceClass,
} from "@elizaos/core";
import type { AppServices } from "@/services";

export function createAwarenessRuntimeService(
  services: AppServices,
): ServiceClass {
  class AwarenessRuntimeService extends ElizaService {
    static serviceType = DOOLITTLE_AWARENESS_SERVICE;

    capabilityDescription =
      "Owns the Doolittle awareness registry and composes runtime self-status.";

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime: IAgentRuntime): Promise<Service> {
      services.awareness.initialize(services);
      return new AwarenessRuntimeService(runtime);
    }

    composeSummary(runtime: IAgentRuntime): Promise<string> {
      return services.awareness.composeSummary(runtime);
    }

    isInitialized(): boolean {
      return services.awareness.isInitialized();
    }

    contributorCount(): number {
      return services.awareness.contributorCount();
    }

    async stop(): Promise<void> {}
  }

  return AwarenessRuntimeService;
}
