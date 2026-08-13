import { describe, expect, it } from "vitest";
import { resolveTaskNavigationIntent } from "./task-navigation";

describe("resolveTaskNavigationIntent", () => {
  it("keeps the intent pending while the task request is loading or failed", () => {
    expect(
      resolveTaskNavigationIntent({
        taskId: "task-1",
        loading: true,
        tasks: [],
      }),
    ).toEqual({ kind: "wait" });
    expect(
      resolveTaskNavigationIntent({
        taskId: "task-1",
        loading: false,
        error: "network unavailable",
        tasks: [],
      }),
    ).toEqual({ kind: "wait" });
  });

  it("selects a loaded task and reports a confirmed miss separately", () => {
    expect(
      resolveTaskNavigationIntent({
        taskId: "task-1",
        loading: false,
        tasks: [{ id: "task-1" }],
      }),
    ).toEqual({ kind: "select", taskId: "task-1" });
    expect(
      resolveTaskNavigationIntent({
        taskId: "task-1",
        loading: false,
        tasks: [],
      }),
    ).toEqual({ kind: "missing" });
  });
});
