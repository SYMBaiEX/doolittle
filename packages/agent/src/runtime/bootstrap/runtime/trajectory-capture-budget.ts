import {
  type AgentRuntime,
  type IAgentRuntime,
  resolveTrajectoryLogger,
  Service,
} from "@elizaos/core";
import { executeRawSql } from "@elizaos/plugin-sql";
import {
  resolveTrajectoryCaptureBudget,
  type TrajectoryCaptureBudget,
} from "../env/trajectory-capture";

const CHECK_INTERVAL_MS = 5_000;
const TRAJECTORY_RELATION_BYTES = `
  SELECT COALESCE(SUM(pg_total_relation_size(to_regclass(relation))), 0) AS bytes
  FROM (VALUES ('trajectories'), ('trajectory_steps'), ('trajectory_step_index'))
    AS trajectory_relations(relation)
`;

type CaptureControl = {
  setEnabled(enabled: boolean): void;
};

function hasCaptureControl(logger: object | null): logger is CaptureControl {
  return (
    logger !== null &&
    "setEnabled" in logger &&
    typeof logger.setEnabled === "function"
  );
}

class TrajectoryCaptureBudgetService extends Service {
  static serviceType = "doolittle-trajectory-capture-budget";
  capabilityDescription = "Stops diagnostic trajectory capture at its budget.";
  private timer?: NodeJS.Timeout;
  private deadline?: NodeJS.Timeout;
  private checking = false;
  private stopped = false;

  static async start(
    runtime: IAgentRuntime,
  ): Promise<TrajectoryCaptureBudgetService> {
    const service = new TrajectoryCaptureBudgetService(runtime);
    const budget = resolveTrajectoryCaptureBudget(process.env);
    if (!budget) return service;
    const logger = resolveTrajectoryLogger(runtime);
    if (!hasCaptureControl(logger)) {
      throw new Error("The Eliza trajectory logger has no capture switch.");
    }
    // The SDK enables capture from the environment. Keep it paused until the
    // persisted footprint has been checked, including older debug sessions.
    logger.setEnabled(false);
    if (await service.checkBytes(logger, budget)) {
      logger.setEnabled(true);
      service.deadline = setTimeout(
        () =>
          service.halt(logger, "time-budget", {
            maxMinutes: budget.durationMs / 60_000,
          }),
        budget.durationMs,
      );
      service.deadline.unref();
      service.timer = setInterval(() => {
        if (!service.checking) void service.checkBytes(logger, budget);
      }, CHECK_INTERVAL_MS);
      service.timer.unref();
    }
    return service;
  }

  private async checkBytes(
    logger: CaptureControl,
    budget: TrajectoryCaptureBudget,
  ): Promise<boolean> {
    this.checking = true;
    try {
      const { rows } = await executeRawSql(
        this.runtime as AgentRuntime,
        TRAJECTORY_RELATION_BYTES,
      );
      if (this.stopped) return false;
      const bytes = Number(rows[0]?.bytes);
      if (!Number.isSafeInteger(bytes) || bytes < 0) {
        throw new Error("Invalid trajectory storage size");
      }
      if (bytes >= budget.relationBytes) {
        this.halt(logger, "storage-budget", {
          bytes,
          maxBytes: budget.relationBytes,
        });
        return false;
      }
      return true;
    } catch {
      if (!this.stopped) this.halt(logger, "storage-size-unavailable");
      return false;
    } finally {
      this.checking = false;
    }
  }

  private halt(
    logger: CaptureControl,
    reason: string,
    fields: Record<string, number> = {},
  ): void {
    this.prepareStop();
    logger.setEnabled(false);
    this.runtime.logger.warn(
      { reason, ...fields },
      "Full diagnostic trajectory capture stopped. The current trace may be incomplete. Run receipts are still recorded.",
    );
  }

  prepareStop(): void {
    this.stopped = true;
    clearInterval(this.timer);
    clearTimeout(this.deadline);
  }

  async stop(): Promise<void> {
    this.prepareStop();
  }
}

export async function enforceTrajectoryCaptureBudget(
  runtime: AgentRuntime,
): Promise<void> {
  if (!resolveTrajectoryCaptureBudget(process.env)) return;
  await runtime.registerService(TrajectoryCaptureBudgetService);
  await runtime.getServiceLoadPromise(
    TrajectoryCaptureBudgetService.serviceType,
  );
}
