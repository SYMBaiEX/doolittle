import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos/plugin-compat";

export interface AgentSkillsPluginOptions {
  skills: {
    list(): unknown[];
    get(slug: string): unknown;
    generated(): unknown[];
    catalog(limit?: number): Promise<unknown>;
    searchCatalog(query: string, limit?: number): Promise<unknown>;
  };
  synthesis: {
    synthesize(taskId: string): Promise<unknown>;
  };
}

export function createAgentSkillsPlugin(
  options: AgentSkillsPluginOptions,
): Plugin {
  const AgentSkillsService = createServiceAdapter({
    serviceType: "agent_skills",
    capabilityDescription:
      "Official-style agent skills service backed by Eliza Agent skill discovery and synthesis.",
    create: async () => ({
      list() {
        return options.skills.list();
      },
      get(slug: string) {
        return options.skills.get(slug);
      },
      generated() {
        return options.skills.generated();
      },
      catalog(limit = 20) {
        return options.skills.catalog(limit);
      },
      searchCatalog(query: string, limit = 15) {
        return options.skills.searchCatalog(query, limit);
      },
      synthesize(taskId: string) {
        return options.synthesis.synthesize(taskId);
      },
    }),
  });

  return createServicePlugin(
    "agent-skills",
    "Official-style agent skills plugin layered onto Eliza Agent skills and synthesis.",
    AgentSkillsService,
  );
}

export default createAgentSkillsPlugin;
