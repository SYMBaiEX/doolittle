import { describe, expect, it } from "vitest";
import type { DelegationTaskRecord } from "../orchestration-resources";
import { availableTaskQueueTiers, filterTaskQueue } from "./task-queue-model";

const tasks: DelegationTaskRecord[] = [
  {
    id: "research",
    title: "Research account routing",
    objective: "Trace the Codex bridge",
    status: "running",
    capabilityProfile: "research",
  },
  {
    id: "approval",
    title: "Review provider migration",
    objective: "Approve the Eliza-native change",
    status: "needs-approval",
    framework: "claude-code",
  },
  {
    id: "complete",
    title: "Document runtime",
    objective: "Record the public contract",
    status: "completed",
  },
];

describe("task queue model", () => {
  it("offers only lifecycle tiers present in the current queue", () => {
    expect(availableTaskQueueTiers(tasks)).toEqual([
      "all",
      "running",
      "approval",
      "completed",
    ]);
  });

  it("filters across task copy and normalized lifecycle tier", () => {
    expect(
      filterTaskQueue(tasks, { query: "codex", tier: "all" }).map(
        (task) => task.id,
      ),
    ).toEqual(["research"]);
    expect(
      filterTaskQueue(tasks, { query: "eliza", tier: "approval" }).map(
        (task) => task.id,
      ),
    ).toEqual(["approval"]);
    expect(filterTaskQueue(tasks, { query: "", tier: "completed" })).toEqual([
      tasks[2],
    ]);
  });
});
