import { bindPluginStorage } from "@doolittle/contracts";
import type { Plugin } from "@elizaos/core";
import { createPlanningService } from "./service";
import type { PlanningPluginOptions } from "./types";

export function createPlanningPlugin(options: PlanningPluginOptions): Plugin {
  const storage = bindPluginStorage("planning", options.storage);
  const PlanningService = createPlanningService(storage.rootDir);

  return {
    name: "@doolittle/plugin-planning",
    description:
      "Doolittle operator-plan projection linked to official Eliza tasks and workflow records.",
    services: [PlanningService],
    providers: [],
    actions: [],
    evaluators: [],
  };
}
