import { EventType, type IAgentRuntime, type Task } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  createSdkCapabilitiesRuntimeService,
  createSdkCapabilityEvents,
} from "./sdk-capabilities";

function makeRuntime(opts?: {
  existingTask?: boolean;
  throwOnWorker?: boolean;
}) {
  const calls = {
    workers: [] as string[],
    unregisteredWorkers: [] as string[],
    created: [] as string[],
  };
  const runtime = {
    registerTaskWorker: (worker: { name: string }) => {
      if (opts?.throwOnWorker) {
        throw new Error("task workers unavailable");
      }
      calls.workers.push(worker.name);
    },
    unregisterTaskWorker: (name: string) => {
      calls.unregisteredWorkers.push(name);
      return true;
    },
    getTask: async () =>
      opts?.existingTask ? ({ id: "existing" } as unknown as Task) : null,
    createTask: async (task: Task) => {
      calls.created.push(task.name);
      return "task-uuid";
    },
    getSetting: () => null,
    logger: { debug: () => {}, warn: () => {} },
  } as unknown as IAgentRuntime;
  return { runtime, calls };
}

describe("SDK capability lifecycle", () => {
  it("declares tool audit through the native plugin event surface", async () => {
    const debug = vi.fn();
    const events = createSdkCapabilityEvents();
    const handler = events[EventType.HOOK_TOOL_AFTER]?.[0];

    await handler?.({
      runtime: { logger: { debug } },
      toolName: "READ_FILE",
      result: { ok: true },
    } as never);

    expect(debug).toHaveBeenCalledWith(
      {
        src: "doolittle:tool-audit",
        tool: "READ_FILE",
        ok: true,
      },
      "[DOOLITTLE] tool executed",
    );
  });

  it("registers workers after service start and schedules the maintenance task", async () => {
    const { runtime, calls } = makeRuntime();
    const ServiceClass = createSdkCapabilitiesRuntimeService();
    const service = await ServiceClass.start(runtime);

    expect(calls.workers).toContain("DOOLITTLE_SELF_MAINTENANCE");
    expect(calls.created).toContain("DOOLITTLE_SELF_MAINTENANCE");

    await service.stop();
    expect(calls.unregisteredWorkers).toContain("DOOLITTLE_SELF_MAINTENANCE");
  });

  it("does not recreate the maintenance task when it already exists", async () => {
    const { runtime, calls } = makeRuntime({ existingTask: true });
    const ServiceClass = createSdkCapabilitiesRuntimeService();
    await ServiceClass.start(runtime);

    expect(calls.workers).toContain("DOOLITTLE_SELF_MAINTENANCE");
    expect(calls.created).toEqual([]);
  });

  it("keeps optional worker failures from blocking runtime startup", async () => {
    const { runtime, calls } = makeRuntime({ throwOnWorker: true });
    const ServiceClass = createSdkCapabilitiesRuntimeService();

    await expect(ServiceClass.start(runtime)).resolves.toBeDefined();
    expect(calls.workers).toEqual([]);
  });
});
