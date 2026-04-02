import { GatewayRunner } from "@doolittle/agent/plugin-api";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Service,
  type ServiceClass,
} from "@elizaos/core";
import type { DoolittlePluginDependencies } from "./types";

export function createGatewayRuntimeService({
  config,
  services,
}: DoolittlePluginDependencies): ServiceClass {
  class GatewayRuntimeService extends ElizaService {
    static serviceType = "doolittle_gateway";

    capabilityDescription =
      "Manages the Doolittle gateway lifecycle and platform routing.";

    runner?: GatewayRunner;

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime: IAgentRuntime): Promise<Service> {
      return new GatewayRuntimeService(runtime);
    }

    ensureRunner(): GatewayRunner {
      if (!this.runner) {
        this.runner = new GatewayRunner({
          config,
          services,
          runtime: this.runtime,
        });
      }
      return this.runner;
    }

    async startGateway(): Promise<void> {
      await this.ensureRunner().start();
    }

    async stop(): Promise<void> {
      await this.runner?.stop();
    }
  }

  return GatewayRuntimeService;
}
