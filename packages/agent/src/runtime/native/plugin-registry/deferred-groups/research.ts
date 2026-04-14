import type { Plugin } from "@elizaos/core";
import { normalizePlugin } from "../support";
import {
  type DeferredPluginGroupContext,
  resolveDeferredPluginDataRoot,
} from "./shared";

export async function loadDeferredResearchPlugins({
  services,
  config,
}: DeferredPluginGroupContext): Promise<Plugin[]> {
  const [{ actionBenchPlugin }, { createAutocoderPlugin }] = await Promise.all([
    import("@elizaos/plugin-action-bench"),
    import("@elizaos/plugin-autocoder"),
  ]);

  return [
    normalizePlugin(actionBenchPlugin),
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
      storage: {
        dataRoot: resolveDeferredPluginDataRoot(config),
      },
    }),
  ];
}
