import type { Plugin } from "@elizaos/core";
import { createAutocoderPlugin } from "@plugins/doolittle-plugin";
import type { DeferredPluginGroupContext } from "./shared";

export function loadDeferredResearchPlugins({
  services,
  config,
}: DeferredPluginGroupContext): Plugin[] {
  return [
    createAutocoderPlugin({
      terminal: {
        run: (command, timeoutMs) => services.terminal.run(command, timeoutMs),
      },
      repository: {
        isRepository: () => services.repository.isRepository(),
        status: () => services.repository.status(),
        diffStat: () => services.repository.diffStat(),
        recentCommits: (limit = 5) => services.repository.recentCommits(limit),
      },
      workspace: {
        rootDir: () => config.workspaceDir,
      },
    }),
  ];
}
