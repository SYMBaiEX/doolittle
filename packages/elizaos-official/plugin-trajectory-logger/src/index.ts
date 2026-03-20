import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos-official/compat";

export interface TrajectoryLoggerPluginOptions {
  trajectories: {
    exportLatest(): unknown;
    listBundles(): unknown[];
    compareLatest(): unknown;
  };
}

export function createTrajectoryLoggerPlugin(
  options: TrajectoryLoggerPluginOptions,
): Plugin {
  const TrajectoryLoggerService = createServiceAdapter({
    serviceType: "trajectory_logger",
    capabilityDescription:
      "Official-style trajectory logger service backed by Eliza Agent trajectory workflows.",
    create: async () => ({
      exportLatest() {
        return options.trajectories.exportLatest();
      },
      bundles() {
        return options.trajectories.listBundles();
      },
      compareLatest() {
        return options.trajectories.compareLatest();
      },
    }),
  });

  return createServicePlugin(
    "trajectory-logger",
    "Official-style trajectory logger plugin for Eliza Agent research workflows.",
    TrajectoryLoggerService,
  );
}

export default createTrajectoryLoggerPlugin;
