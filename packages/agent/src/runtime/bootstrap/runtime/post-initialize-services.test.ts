import { describe, expect, it, vi } from "vitest";

const trajectoryPersistence = vi.hoisted(() => ({
  installDatabaseTrajectoryLogger: vi.fn(async () => undefined),
}));

vi.mock("@elizaos/agent/runtime/trajectory-persistence", () => ({
  installDatabaseTrajectoryLogger:
    trajectoryPersistence.installDatabaseTrajectoryLogger,
}));

import type { AgentRuntime } from "@elizaos/core";
import { finalizeCoreRuntimeServices } from "./post-initialize-services";

describe("finalizeCoreRuntimeServices", () => {
  it("configures initialized services without registering lifecycle owners", async () => {
    const runtime = {
      getServiceLoadPromise: vi.fn(async () => ({ loaded: true })),
      registerService: vi.fn(),
    } as unknown as AgentRuntime;

    await finalizeCoreRuntimeServices(runtime);

    expect(runtime.getServiceLoadPromise).toHaveBeenNthCalledWith(
      1,
      "trajectories",
    );
    expect(
      trajectoryPersistence.installDatabaseTrajectoryLogger,
    ).toHaveBeenCalledWith(runtime);
    expect(runtime.getServiceLoadPromise).toHaveBeenNthCalledWith(
      2,
      "AGENT_SKILLS_SERVICE",
    );
    expect(runtime.getServiceLoadPromise).toHaveBeenNthCalledWith(
      3,
      "doolittle_run_progress",
    );
    expect(runtime.registerService).not.toHaveBeenCalled();
  });
});
