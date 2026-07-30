import type { AppServices } from "@doolittle/agent/plugin-api";
import { DOOLITTLE_SHELL_SERVICE } from "@doolittle/contracts";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Service,
  type ServiceClass,
} from "@elizaos/core";

export function createShellRuntimeService(services: AppServices): ServiceClass {
  class ShellRuntimeService extends ElizaService {
    static serviceType = DOOLITTLE_SHELL_SERVICE;

    capabilityDescription =
      "Executes approved local commands through Doolittle terminal backends.";

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime: IAgentRuntime): Promise<Service> {
      return new ShellRuntimeService(runtime);
    }

    run(command: string): Promise<unknown> {
      return services.terminal.run(command);
    }

    history(limit = 10): unknown[] {
      return services.terminal.recent(limit);
    }

    status(): Promise<unknown> {
      return services.terminal.status();
    }

    async stop(): Promise<void> {
      services.terminal.disposeInteractiveSessions();
    }
  }

  return ShellRuntimeService;
}
