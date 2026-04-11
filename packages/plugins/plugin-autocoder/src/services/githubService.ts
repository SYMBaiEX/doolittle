import type { IAgentRuntime } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";

import { nowIso, planningEnvelope } from "../shared/planning";

export function createGitHubService() {
  class GitHubService extends ElizaService {
    static serviceType = "github";
    capabilityDescription =
      "Workspace-native GitHub lifecycle service for autocoder workflows.";

    static async start(runtime?: IAgentRuntime): Promise<GitHubService> {
      return new GitHubService(runtime);
    }

    async stop(): Promise<void> {}

    async createRepository(name: string, isPrivate = true) {
      const command = `gh repo create ${name} ${isPrivate ? "--private" : "--public"} --source . --push --confirm`;
      return planningEnvelope({
        createdAt: nowIso(),
        name,
        private: isPrivate,
        command,
        status: "planned",
        detail:
          "Repository creation is routed through the local GitHub CLI path and can be executed when credentials are available.",
      });
    }

    async deleteRepository(name: string) {
      const command = `gh repo delete ${name} --yes`;
      return planningEnvelope({
        deletedAt: nowIso(),
        name,
        command,
        status: "planned",
        detail:
          "Repository deletion is routed through the local GitHub CLI path and can be executed when credentials are available.",
      });
    }
  }

  return GitHubService;
}
