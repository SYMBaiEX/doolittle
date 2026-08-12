import { describe, expect, it } from "vitest";
import {
  appendSurfaceNotice,
  codegenRequestBody,
  parseSupervisionConcurrency,
  updateBusyKeys,
} from "./useOrchestrationActions";

describe("orchestration action state", () => {
  it("tracks independent operations without mutating prior state", () => {
    const initial = { "task:first": true };
    const added = updateBusyKeys(initial, "plan:second", true);
    const cleared = updateBusyKeys(added, "task:first", false);

    expect(initial).toEqual({ "task:first": true });
    expect(added).toEqual({ "task:first": true, "plan:second": true });
    expect(cleared).toEqual({ "plan:second": true });
  });

  it("keeps the three most recent operator notices", () => {
    const notices = [1, 2, 3].map((id) => ({
      id,
      tone: "good" as const,
      message: `notice ${id}`,
    }));

    expect(
      appendSurfaceNotice(notices, {
        id: 4,
        tone: "warn",
        message: "notice 4",
      }).map((notice) => notice.id),
    ).toEqual([2, 3, 4]);
  });

  it("accepts only positive finite supervision concurrency", () => {
    expect(parseSupervisionConcurrency("4")).toBe(4);
    expect(parseSupervisionConcurrency("0")).toBeUndefined();
    expect(parseSupervisionConcurrency("not-a-number")).toBeUndefined();
  });

  it("builds mode-specific bounded code generation requests", () => {
    expect(
      codegenRequestBody({
        mode: "qa",
        projectName: "ignored",
        projectPath: " /repo ",
        prompt: "ignored",
        targetType: "ignored",
      }),
    ).toEqual({ projectPath: "/repo" });
    expect(
      codegenRequestBody({
        mode: "generate",
        projectName: " App ",
        projectPath: "",
        prompt: " Build it ",
        targetType: "",
      }),
    ).toEqual({ projectName: "App", prompt: "Build it" });
    expect(
      codegenRequestBody({
        mode: "prd",
        projectName: " Tool ",
        projectPath: "",
        prompt: " Describe it ",
        targetType: " ",
      }),
    ).toEqual({
      projectName: "Tool",
      description: "Describe it",
      targetType: "plugin",
    });
  });
});
