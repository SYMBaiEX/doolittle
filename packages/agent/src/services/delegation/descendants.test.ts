import { describe, expect, it } from "bun:test";
import type { DelegationTaskRecord } from "@/types";
import { visitDelegationDescendants } from "./descendants";

function makeTask(id: string, parentTaskId?: string): DelegationTaskRecord {
  const now = "2026-04-10T00:00:00.000Z";
  return {
    id,
    title: `Task ${id}`,
    objective: `Objective ${id}`,
    status: "pending",
    notes: [],
    createdAt: now,
    updatedAt: now,
    executionMode: "local",
    orchestrationMode: "sequential",
    priority: "normal",
    tags: [],
    labels: [],
    childTaskIds: [],
    attempts: 0,
    maxAttempts: 3,
    parentTaskId,
  };
}

describe("delegation descendants", () => {
  it("visits nested descendants depth-first with the immediate parent id", () => {
    const root = makeTask("root");
    const child = makeTask("child", "root");
    const sibling = makeTask("sibling", "root");
    const grandchild = makeTask("grandchild", "child");
    const tasks = [root, child, sibling, grandchild];

    const visited: Array<[string, string]> = [];
    visitDelegationDescendants(
      "root",
      (parentTaskId) =>
        tasks.filter((task) => task.parentTaskId === parentTaskId),
      (task, parentTaskId) => {
        visited.push([task.id, parentTaskId]);
      },
    );

    expect(visited).toEqual([
      ["child", "root"],
      ["grandchild", "child"],
      ["sibling", "root"],
    ]);
  });
});
