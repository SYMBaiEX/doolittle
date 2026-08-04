import { describe, expect, it } from "vitest";
import {
  compactDuration,
  orchestrationStatusTier,
  orchestrationTimingLabel,
  scopeTasksByWorkspace,
  taskCapabilityLabel,
  taskCreatePayload,
  taskExecutionLabel,
  taskSpawnPayload,
} from "./orchestration-helpers";

describe("orchestration helpers", () => {
  it("maps live board statuses into stable tiers", () => {
    expect(orchestrationStatusTier("running")).toBe("running");
    expect(orchestrationStatusTier("draft")).toBe("approval");
    expect(orchestrationStatusTier("pending")).toBe("queued");
    expect(orchestrationStatusTier("completed")).toBe("completed");
    expect(orchestrationStatusTier("cancelled")).toBe("failed");
    expect(orchestrationStatusTier("idle")).toBe("idle");
  });

  it("formats compact elapsed durations for long-running work", () => {
    expect(compactDuration(45_000)).toBe("<1m");
    expect(compactDuration(30 * 60_000)).toBe("30m");
    expect(compactDuration(125 * 60_000)).toBe("2h 5m");
    expect(compactDuration(49 * 60 * 60_000)).toBe("2d 1h");
  });

  it("builds queue, live, and completion timing labels", () => {
    const now = Date.parse("2026-07-27T18:00:00.000Z");

    expect(
      orchestrationTimingLabel({
        status: "pending",
        createdAt: "2026-07-27T17:15:00.000Z",
        now,
      }),
    ).toBe("Queued 45m");

    expect(
      orchestrationTimingLabel({
        status: "running",
        startedAt: "2026-07-27T17:45:00.000Z",
        now,
      }),
    ).toBe("Live 15m");

    expect(
      orchestrationTimingLabel({
        status: "completed",
        startedAt: "2026-07-27T16:00:00.000Z",
        completedAt: "2026-07-27T17:30:00.000Z",
        now,
      }),
    ).toBe("Done in 1h 30m");
  });

  it("keeps task queues aligned with the selected project", () => {
    const tasks = [
      { id: "one", workspaceRoot: "/repo/one" },
      { id: "two", workspaceRoot: "/repo/two" },
      { id: "general" },
    ];

    expect(
      scopeTasksByWorkspace(tasks, {
        scope: "project-one",
        workspacePath: "/repo/one",
        platform: "linux",
      }).map((task) => task.id),
    ).toEqual(["one"]);
    expect(
      scopeTasksByWorkspace(tasks, {
        scope: "unscoped",
        platform: "linux",
      }).map((task) => task.id),
    ).toEqual(["general"]);
    expect(
      scopeTasksByWorkspace(tasks, {
        scope: "all",
        platform: "linux",
      }),
    ).toEqual(tasks);
  });

  it("builds canonical task fields while keeping the legacy profile", () => {
    expect(
      taskCreatePayload({
        title: "  Research the SDK  ",
        objective: "  Compare providers  ",
        capability: "research",
        framework: "claude",
        accountId: "claude-work",
        sessionId: "session-1",
      }),
    ).toMatchObject({
      title: "Research the SDK",
      objective: "Compare providers",
      profile: "research",
      capabilityProfile: "research",
      kind: "research",
      framework: "claude",
      accountId: "claude-work",
      sessionId: "session-1",
    });
  });

  it("describes canonical task capability and execution without overclaiming", () => {
    expect(taskCapabilityLabel("research")).toBe("research");
    expect(taskCapabilityLabel(undefined, "coding")).toBe("coding");
    expect(taskExecutionLabel("delegated")).toBe("delegated session");
    expect(taskExecutionLabel()).toBe("local runtime");
  });

  it("does not attribute spawned child tasks to the parent receipt", () => {
    const payload = taskSpawnPayload({
      title: "  Child task ",
      objective: "  Implement the fix ",
      group: " group-a ",
      profile: " coding ",
      capabilityProfile: " coding ",
      kind: " coding ",
      framework: " claude ",
      executionMode: " delegated ",
      workspaceRoot: " /repo/project ",
    });

    expect(payload).toEqual({
      title: "Child task",
      objective: "Implement the fix",
      group: "group-a",
      profile: "coding",
      capabilityProfile: "coding",
      kind: "coding",
      framework: "claude",
      executionMode: "delegated",
      workspaceRoot: "/repo/project",
    });
    expect(payload).not.toHaveProperty("accountId");
    expect(payload).not.toHaveProperty("sessionId");

    expect(
      taskSpawnPayload({ title: "   ", objective: "Objective" }).title,
    ).toBe("Child task");
  });
});
