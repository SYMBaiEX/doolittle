import { bindPluginStorage } from "@doolittle/contracts";
import type { Plugin } from "@elizaos/core";
import { createPlanningService } from "./service";
import type { PlanningPluginOptions } from "./types";

export function createPlanningPlugin(options: PlanningPluginOptions): Plugin {
  const storage = bindPluginStorage("planning", options.storage);
  const PlanningService = createPlanningService(storage.rootDir, options);

  return {
    name: "@doolittle/plugin-planning",
    description:
      "Doolittle planning adapter for execution plans linked to native tasks and workflows.",
    services: [PlanningService],
    providers: [],
    actions: [],
    evaluators: [],
  };
}
