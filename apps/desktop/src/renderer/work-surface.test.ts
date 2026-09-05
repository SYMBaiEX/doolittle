import { describe, expect, test } from "vitest";
import {
  shouldShowWorkResourceStatus,
  WORK_TABS,
} from "./OrchestrationPage";

describe("consolidated work surface", () => {
  test("presents one lifecycle from queued work through review", () => {
    expect(WORK_TABS).toEqual([
      { id: "tasks", label: "Queue" },
      { id: "runs", label: "Runs" },
      { id: "review", label: "Review" },
      { id: "agents", label: "Agents" },
      { id: "plans", label: "Plans" },
      { id: "automations", label: "Automations" },
      { id: "inbox", label: "Inbox" },
    ]);
  });

  test("keeps each responsibility represented once", () => {
    const ids = WORK_TABS.map((tab) => tab.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("keeps healthy resource plumbing out of the task workspace", () => {
    const readyResource = {
      data: {},
      error: null,
      hasData: true,
      isValidating: false,
      loading: false,
      reload: () => undefined,
      status: "ready" as const,
    };
    const loadingResource = { ...readyResource, status: "loading" as const };
    const failedResource = { ...readyResource, status: "error" as const };

    expect(
      shouldShowWorkResourceStatus([
        { label: "task queue", resource: readyResource },
      ]),
    ).toBe(false);
    expect(
      shouldShowWorkResourceStatus([
        { label: "task queue", resource: loadingResource },
      ]),
    ).toBe(true);
    expect(
      shouldShowWorkResourceStatus([
        { label: "task queue", resource: failedResource },
      ]),
    ).toBe(true);
  });
});
