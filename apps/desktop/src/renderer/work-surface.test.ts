import { describe, expect, test } from "bun:test";
import { WORK_TABS } from "./OrchestrationPage";

describe("consolidated work surface", () => {
  test("presents one lifecycle from queued work through review", () => {
    expect(WORK_TABS).toEqual([
      { id: "tasks", label: "Queue" },
      { id: "agents", label: "Agents" },
      { id: "plans", label: "Plans" },
      { id: "runs", label: "Runs" },
      { id: "review", label: "Review" },
    ]);
  });

  test("keeps each responsibility represented once", () => {
    const ids = WORK_TABS.map((tab) => tab.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
