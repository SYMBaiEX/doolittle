import { describe, expect, it } from "bun:test";
import { EventType, type IAgentRuntime, type Task } from "@elizaos/core";
import { wireSdkCapabilities } from "./sdk-capabilities";

function makeRuntime(opts?: {
  existingTask?: boolean;
  throwOnEvent?: boolean;
}) {
  const calls = {
    events: [] as string[],
    workers: [] as string[],
    created: [] as string[],
  };
  const runtime = {
    registerEvent: (event: string) => {
      if (opts?.throwOnEvent) {
        throw new Error("event registration unavailable");
      }
      calls.events.push(event);
    },
    registerTaskWorker: (worker: { name: string }) => {
      calls.workers.push(worker.name);
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

describe("wireSdkCapabilities", () => {
  it("registers the tool audit hook and schedules the maintenance task", async () => {
    const { runtime, calls } = makeRuntime();
    await wireSdkCapabilities(runtime);
    expect(calls.events).toContain(EventType.HOOK_TOOL_AFTER);
    expect(calls.workers).toContain("DOOLITTLE_SELF_MAINTENANCE");
    expect(calls.created).toContain("DOOLITTLE_SELF_MAINTENANCE");
  });

  it("does not recreate the maintenance task when it already exists", async () => {
    const { runtime, calls } = makeRuntime({ existingTask: true });
    await wireSdkCapabilities(runtime);
    expect(calls.workers).toContain("DOOLITTLE_SELF_MAINTENANCE");
    expect(calls.created).toEqual([]);
  });

  it("is fault-tolerant: a hook failure never blocks task registration", async () => {
    const { runtime, calls } = makeRuntime({ throwOnEvent: true });
    await expect(wireSdkCapabilities(runtime)).resolves.toBeUndefined();
    expect(calls.events).toEqual([]);
    expect(calls.workers).toContain("DOOLITTLE_SELF_MAINTENANCE");
  });
});
