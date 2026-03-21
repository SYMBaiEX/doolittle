import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";

export interface CronPluginOptions {
  cron: {
    list(): unknown[];
    get(id: string): unknown;
    create(input: unknown): unknown;
    update(id: string, patch: unknown): unknown;
    runs(limit?: number): unknown[];
  };
}

export function createCronPlugin(options: CronPluginOptions): Plugin {
  class CronService extends ElizaService {
    static serviceType = "cron";
    capabilityDescription =
      "Cron automation service backed by Eliza Agent automations.";

    private readonly cron = options.cron;

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

    create(input: unknown) {
      return this.cron.create(input);
    }

    update(id: string, patch: unknown) {
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
