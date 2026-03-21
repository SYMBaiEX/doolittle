import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";

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
  class TrajectoryLoggerService extends ElizaService {
    static serviceType = "trajectory_logger";
    capabilityDescription =
      "Trajectory logger service backed by Eliza Agent trajectory workflows.";

    private readonly trajectories = options.trajectories;

    static async start(runtime?: IAgentRuntime): Promise<Service> {
      return new TrajectoryLoggerService(runtime);
    }

    async stop(): Promise<void> {}

    exportLatest() {
      return this.trajectories.exportLatest();
    }

    bundles() {
      return this.trajectories.listBundles();
    }

    compareLatest() {
      return this.trajectories.compareLatest();
    }
  }

  return {
    name: "trajectory-logger",
    description: "Trajectory logger plugin for Eliza Agent research workflows.",
    services: [TrajectoryLoggerService],
  };
}

export default createTrajectoryLoggerPlugin;
