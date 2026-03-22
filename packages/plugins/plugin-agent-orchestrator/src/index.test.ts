import { describe, expect, it } from "bun:test";
import { createAgentOrchestratorPlugin } from "./index";

describe("createAgentOrchestratorPlugin", () => {
  it("exposes orchestration summary metadata from the native service", async () => {
    const plugin = createAgentOrchestratorPlugin({
      delegation: {
        create: () => ({ id: "task-1" }),
        list: () => [{ id: "task-1" }, { id: "task-2" }],
        get: (id) => ({ id }),
        queueSummary: () => ({ pending: 1, activeWorkers: 2 }),
        overview: () => ({ ok: true }),
        getChildren: () => [{ id: "child-1" }],
        tree: (id) => ({ id, children: [{ id: "child-1" }] }),
        spawnChild: () => ({ id: "child-1" }),
        retryTask: () => ({ ok: true }),
        cancel: () => ({ ok: true }),
        supervise: async () => ({ ok: true }),
        runQueued: async () => ({ ok: true }),
      },
    });

    const ServiceCtor = plugin.services?.[0] as unknown as {
      start(runtime?: unknown): Promise<{
        summary(): unknown;
      }>;
    };
    const service = await ServiceCtor.start();
    expect(service.summary()).toEqual({
      tasks: 2,
      queuePending: 1,
      activeWorkers: 2,
      childTasksSupported: true,
      treeSupported: true,
      retrySupported: true,
    });
  });
});
