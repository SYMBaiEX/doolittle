import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";

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
  class AgentSkillsService extends ElizaService {
    static serviceType = "agent_skills";
    capabilityDescription =
      "Agent skills service backed by Eliza Agent skill discovery and synthesis.";

    private readonly skills = options.skills;
    private readonly synthesis = options.synthesis;

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime?: IAgentRuntime): Promise<Service> {
      return new AgentSkillsService(runtime);
    }

    async stop(): Promise<void> {}

    list() {
      return this.skills.list();
    }

    get(slug: string) {
      return this.skills.get(slug);
    }

    generated() {
      return this.skills.generated();
    }

    catalog(limit = 20) {
      return this.skills.catalog(limit);
    }

    searchCatalog(query: string, limit = 15) {
      return this.skills.searchCatalog(query, limit);
    }

    synthesize(taskId: string) {
      return this.synthesis.synthesize(taskId);
    }
  }

  return {
    name: "agent-skills",
    description:
      "Agent skills plugin layered onto Eliza Agent skills and synthesis.",
    services: [AgentSkillsService],
  };
}

export default createAgentSkillsPlugin;
