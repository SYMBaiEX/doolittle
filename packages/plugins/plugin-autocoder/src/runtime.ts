import { createAutocoderPlugin } from "./plugin";

export const autocoderPlugin = createAutocoderPlugin({
  terminal: {
    run: async () => ({
      success: false,
      detail: "Runtime-less autocoder terminal path is unavailable.",
    }),
  },
  repository: {
    isRepository: () => false,
    status: async () => "(runtime-less repository status unavailable)",
    diffStat: async () => "(runtime-less repository diff unavailable)",
    recentCommits: async () => "(runtime-less repository log unavailable)",
  },
  workspace: {
    rootDir: () => process.cwd(),
  },
});

export default autocoderPlugin;
