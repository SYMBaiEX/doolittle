import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";
import type { CronServiceLike } from "./types";

export interface CronPluginOptions {
  cron: Pick<CronServiceLike, "list" | "get" | "runs"> & {
    create(
      input: Parameters<CronServiceLike["create"]>[0],
    ): ReturnType<CronServiceLike["create"]>;
    update(
      id: string,
      patch: Parameters<CronServiceLike["update"]>[1],
    ): ReturnType<CronServiceLike["update"]>;
  };
}

export function createCronPlugin(options: CronPluginOptions): Plugin {
  class CronService extends ElizaService {
    static serviceType = "cron";
    capabilityDescription =
      "Cron automation service backed by Doolittle automations.";

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

    create(input: Parameters<CronServiceLike["create"]>[0]) {
      return this.cron.create(input);
    }

    update(id: string, patch: Parameters<CronServiceLike["update"]>[1]) {
      return this.cron.update(id, patch);
    }

    runs(limit = 20) {
      return this.cron.runs(limit);
    }
  }

  return {
    name: "cron",
    description: "Cron plugin for Doolittle scheduled workflows.",
    services: [CronService],
  };
}

export default createCronPlugin;
