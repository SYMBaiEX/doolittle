import type { Plugin } from "@elizaos/core";
import { createCodeGenerationService } from "./services/codeGenerationService";
import { createGitHubService } from "./services/githubService";
import type { AutocoderPluginOptions } from "./shared/types";

export function createAutocoderPlugin(options: AutocoderPluginOptions): Plugin {
  const CodeGenerationService = createCodeGenerationService(options);
  const GitHubService = createGitHubService();

  return {
    name: "@doolittle/plugin-autocoder",
    description:
      "Doolittle-owned Eliza plugin with experimental planning, research, and GitHub services.",
    services: [CodeGenerationService, GitHubService],
    actions: [],
    providers: [],
    evaluators: [],
  };
}
