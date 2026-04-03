import { bindPluginStorage } from "@doolittle/contracts";
import type { Plugin } from "@elizaos/core";
import { createCodeGenerationService } from "./services/codeGenerationService";
import { createGitHubService } from "./services/githubService";
import { createSecretsManagerService } from "./services/secretsService";
import type { AutocoderPluginOptions } from "./shared/types";

export function createAutocoderPlugin(options: AutocoderPluginOptions): Plugin {
  const storage = bindPluginStorage("autocoder", options.storage);
  const CodeGenerationService = createCodeGenerationService(options);
  const GitHubService = createGitHubService();
  const SecretsManagerService = createSecretsManagerService(storage.rootDir);

  return {
    name: "@elizaos/plugin-autocoder",
    description:
      "Workspace-native autocoder plugin with experimental planning, research, GitHub, and secrets services.",
    services: [CodeGenerationService, GitHubService, SecretsManagerService],
    actions: [],
    providers: [],
    evaluators: [],
  };
}
