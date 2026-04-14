import { describe, expect, it } from "bun:test";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime";
import {
  cancelEffectiveDelegationTask,
  createEffectiveDelegationTask,
  getEffectiveDelegationChildren,
  getEffectiveDelegationOverview,
  getEffectiveDelegationQueue,
  getEffectiveDelegationTask,
  getEffectiveDelegationTasks,
  getEffectiveDelegationTree,
  retryEffectiveDelegationTask,
  spawnEffectiveDelegationChild,
  superviseEffectiveDelegationQueue,
} from "./index";

function createRuntime(services: Record<string, unknown>): RuntimeLike {
  return {
    getService(name: string) {
      return services[name];
    },
  } as unknown as RuntimeLike;
}

function createServices(delegation: Record<string, unknown>): AppServices {
  return {
    delegation,
  } as unknown as AppServices;
}

describe("delegation bridge selectors", () => {
  it("prefers agent_orchestrator for task list", () => {
    const runtime = createRuntime({
      agent_orchestrator: {
        tasks: () => ["native-task"],
      },
    });

    const services = createServices({
      list: () => ["fallback-task"],
    });

    expect(getEffectiveDelegationTasks(runtime, services)).toEqual([
      "native-task",
    ]);
  });

  it("falls back to coding agent when orchestrator is unavailable", () => {
    const runtime = createRuntime({
      coding_agent: {
        tasks: () => ["coding-task"],
      },
    });
    const services = createServices({
      list: () => ["fallback-task"],
    });

    expect(getEffectiveDelegationTasks(runtime, services)).toEqual([
      "coding-task",
    ]);
  });

  it("falls back from coding task methods to services", () => {
    const runtime = createRuntime({
      coding_agent: {
        tasks: () => undefined,
      },
    });
    const services = createServices({
      list: () => ["service-task"],
      queueSummary: () => "service-queue",
      overview: () => ({ operational: true }),
      get: () => ({ id: "service-task" }),
      listChildren: () => ["service-child"],
      tree: () => ({ node: "service-tree" }),
      requeue: () => ({ requeued: true }),
      cancel: () => ({ canceled: true }),
      spawnChild: () => ({ spawned: true }),
      create: () => ({ created: true }),
      supervise: async () => "service-supervise",
    });

    expect(getEffectiveDelegationTasks(runtime, services)).toEqual([
      "service-task",
    ]);
    expect(getEffectiveDelegationQueue(runtime, services)).toBe(
      "service-queue",
    );
    expect(getEffectiveDelegationOverview(runtime, services)).toEqual({
      operational: true,
    });
    expect(getEffectiveDelegationTask(runtime, services, "id")).toEqual({
      id: "service-task",
    });
    expect(getEffectiveDelegationChildren(runtime, services, "id")).toEqual([
      "service-child",
    ]);
    expect(getEffectiveDelegationTree(runtime, services, "id")).toEqual({
      node: "service-tree",
    });
    expect(
      retryEffectiveDelegationTask(runtime, services, "id", "note"),
    ).toEqual({ requeued: true });
    expect(
      cancelEffectiveDelegationTask(runtime, services, "id", "note", {
        cascadeChildren: true,
      }),
    ).toEqual({ canceled: true });
  });

  it("maps orchestration payload on orchestrator create path", () => {
    let createdPayload:
      | {
          title: string;
          objective: string;
          labels?: string[];
          tags?: string[];
        }
      | undefined;

    const runtime = createRuntime({
      agent_orchestrator: {
        createTask: (
          _title: string,
          _objective: string,
          options: { labels?: string[]; tags?: string[] },
        ) => {
          createdPayload = {
            title: _title,
            objective: _objective,
            labels: options.labels,
            tags: options.tags,
          };
          return "created";
        },
      },
    });
    const services = createServices({
      create: () => ({ notExpected: true }),
    });

    const result = createEffectiveDelegationTask(runtime, services, {
      title: "title",
      objective: "objective",
      labels: ["label"],
      metadata: { foo: "bar" },
    });

    expect(result).toBe("created");
    expect(createdPayload).toEqual({
      title: "title",
      objective: "objective",
      labels: ["label"],
      tags: ["label"],
    });
  });

  it("stringifies metadata payload for service fallback create path", () => {
    const runtime = createRuntime({});
    let createPayload: Record<string, unknown> | undefined;
    const services = createServices({
      create: (payload: Record<string, unknown>) => {
        createPayload = payload;
        return payload;
      },
    });

    createEffectiveDelegationTask(runtime, services, {
      title: "service-title",
      objective: "service-objective",
      labels: ["label"],
      metadata: { attempts: 3, urgent: true },
    });

    expect(createPayload).toEqual({
      title: "service-title",
      objective: "service-objective",
      group: undefined,
      profile: undefined,
      priority: undefined,
      labels: ["label"],
      tags: ["label"],
      metadata: {
        attempts: "3",
        urgent: "true",
      },
      executionMode: undefined,
      orchestrationMode: undefined,
      maxAttempts: undefined,
    });
  });

  it("prefers orchestrator child creation but falls back to services", () => {
    const services = createServices({
      spawnChild: () => ({ spawned: "service" }),
    });

    const runtimeWithOrchestrator = createRuntime({
      agent_orchestrator: {
        spawnChild: () => ({ spawned: "orchestrator" }),
      },
    });
    const runtimeWithoutOrchestrator = createRuntime({});

    expect(
      spawnEffectiveDelegationChild(
        runtimeWithOrchestrator,
        services,
        "parent",
        {
          title: "child",
          objective: "nested",
        },
      ),
    ).toEqual({ spawned: "orchestrator" });

    expect(
      spawnEffectiveDelegationChild(
        runtimeWithoutOrchestrator,
        services,
        "parent",
        {
          title: "child",
          objective: "nested",
        },
      ),
    ).toEqual({ spawned: "service" });
  });

  it("routes supervision through orchestrator then services", async () => {
    const services = createServices({
      supervise: async () => "service-supervised",
    });

    expect(
      await superviseEffectiveDelegationQueue(
        createRuntime({
          agent_orchestrator: {
            supervise: async () => "native-supervised",
          },
        }),
        services,
        async () => "ok",
      ),
    ).toBe("native-supervised");

    expect(
      await superviseEffectiveDelegationQueue(
        createRuntime({}),
        services,
        async () => "ok",
      ),
    ).toBe("service-supervised");
  });
});
