import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";
import type { CronService as AgentCronService } from "@/services/cron-service";

export interface CronPluginOptions {
  cron: Pick<AgentCronService, "list" | "get" | "runs"> & {
    create(
      input: Parameters<AgentCronService["create"]>[0],
    ): ReturnType<AgentCronService["create"]>;
    update(
      id: string,
      patch: Parameters<AgentCronService["update"]>[1],
    ): ReturnType<AgentCronService["update"]>;
  };
}

export function createCronPlugin(options: CronPluginOptions): Plugin {
  class CronService extends ElizaService {
    static serviceType = "cron";
    capabilityDescription =
      "Cron automation service backed by Eliza Agent automations.";

    private readonly cron = options.cron;

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime?: IAgentRuntime): Promise<Service> {
      return new CronService(runtime);
    }

    async stop(): Promise<void> {}

    list() {
      return this.cron.list();
    }

    get(id: string) {
      return this.cron.get(id);
    }

    create(input: Parameters<AgentCronService["create"]>[0]) {
      return this.cron.create(input);
    }

    update(id: string, patch: Parameters<AgentCronService["update"]>[1]) {
      return this.cron.update(id, patch);
    }

    runs(limit = 20) {
      return this.cron.runs(limit);
    }
  }

  return {
    name: "cron",
    description: "Cron plugin for Eliza Agent scheduled workflows.",
    services: [CronService],
  };
}

export default createCronPlugin;
