import { describe, expect, it } from "bun:test";
import {
  buildDelegationSkippedTasks,
  listPendingDelegationTasks,
} from "./queue";

describe("delegation queue helpers", () => {
  it("returns pending and retryable failed tasks in created order", () => {
    const tasks = [
      {
        id: "b",
        title: "Second",
        objective: "second",
        status: "pending",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "a",
        title: "First",
        objective: "first",
        status: "failed",
        attempts: 1,
        maxAttempts: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "c",
        title: "Done",
        objective: "done",
        status: "completed",
        createdAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "d",
        title: "Exhausted",
        objective: "exhausted",
        status: "failed",
        attempts: 2,
        maxAttempts: 2,
        createdAt: "2026-01-04T00:00:00.000Z",
      },
    ] as const;

    expect(
      listPendingDelegationTasks([...tasks] as unknown as never[]).map(
        (task) => task.id,
      ),
    ).toEqual(["a", "b"]);
  });

  it("builds skipped entries for retryable tasks outside the active filter", () => {
    const tasks = [
      {
        id: "ops-1",
        title: "Ops",
        objective: "ops",
        group: "ops",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "research-1",
        title: "Research",
        objective: "research",
        group: "research",
        status: "failed",
        attempts: 0,
        maxAttempts: 2,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ] as const;

    expect(
      buildDelegationSkippedTasks([...tasks] as unknown as never[], {
        group: "ops",
      }),
    ).toEqual([
      {
        id: "research-1",
        reason: "Filtered out by the current supervision selector.",
      },
    ]);
  });
});
