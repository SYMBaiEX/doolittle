import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos/plugin-compat";

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
  const CronService = createServiceAdapter({
    serviceType: "cron",
    capabilityDescription:
      "Official-style cron automation service backed by Eliza Agent automations.",
    create: async () => ({
      list() {
        return options.cron.list();
      },
      get(id: string) {
        return options.cron.get(id);
      },
      create(input: unknown) {
        return options.cron.create(input);
      },
      update(id: string, patch: unknown) {
        return options.cron.update(id, patch);
      },
      runs(limit = 20) {
        return options.cron.runs(limit);
      },
    }),
  });

  return createServicePlugin(
    "cron",
    "Official-style cron plugin for Eliza Agent scheduled workflows.",
    CronService,
  );
}

export default createCronPlugin;
