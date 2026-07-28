import { describe, expect, it, vi } from "vitest";

const trajectoryPersistence = vi.hoisted(() => ({
  installDatabaseTrajectoryLogger: vi.fn(async () => undefined),
}));

vi.mock("@elizaos/agent/runtime/trajectory-persistence", () => ({
  DatabaseTrajectoryLogger: class DatabaseTrajectoryLogger {
    static serviceType = "trajectories";
    readonly runtime: unknown;

    constructor(runtime: unknown) {
      this.runtime = runtime;
    }
  },
  installDatabaseTrajectoryLogger:
    trajectoryPersistence.installDatabaseTrajectoryLogger,
}));

import { DatabaseTrajectoryLogger } from "@elizaos/agent/runtime/trajectory-persistence";
import {
  type AgentRuntime,
  ApprovalService,
  ToolPolicyService,
} from "@elizaos/core";
import { ensureCoreRuntimeServices } from "./core-services";

describe("ensureCoreRuntimeServices", () => {
  it("registers the SDK database trajectory logger once", async () => {
    const registered: unknown[] = [];
    const runtime = {
      getService: vi.fn(() => undefined),
      registerService: vi.fn(async (service: unknown) => {
        registered.push(service);
      }),
    } as unknown as AgentRuntime;

    await ensureCoreRuntimeServices(runtime);

    expect(registered).toEqual([
      ApprovalService,
      ToolPolicyService,
      DatabaseTrajectoryLogger,
    ]);
    expect(
      trajectoryPersistence.installDatabaseTrajectoryLogger,
    ).toHaveBeenCalledWith(runtime);
  });

  it("does not register an existing SDK database trajectory logger", async () => {
    const runtime = {
      getService: vi.fn((serviceType: string) =>
        serviceType === DatabaseTrajectoryLogger.serviceType ? {} : undefined,
      ),
      registerService: vi.fn(),
    } as unknown as AgentRuntime;

    await ensureCoreRuntimeServices(runtime);

    expect(runtime.registerService).not.toHaveBeenCalledWith(
      DatabaseTrajectoryLogger,
    );
  });
});
