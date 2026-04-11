import { describe, expect, it } from "bun:test";

import {
  buildDelegationUpdateEvent,
  isDelegationProcessAlive,
  mergeDelegationLists,
  normalizeDelegationLabels,
  normalizeDelegationMetadata,
} from "./utils";

describe("delegation/utils", () => {
  it("normalizes labels and metadata", () => {
    expect(normalizeDelegationLabels([" alpha ", "beta", "", "alpha"])).toEqual(
      ["alpha", "beta"],
    );
    expect(
      normalizeDelegationMetadata({
        " owner ": " alice ",
        empty: " ",
        " ": "missing",
      }),
    ).toEqual({ owner: "alice" });
  });

  it("merges lists without blank entries", () => {
    expect(
      mergeDelegationLists(["alpha", " beta "], undefined, ["beta", "", "z"]),
    ).toEqual(["alpha", "beta", "z"]);
  });

  it("builds update events and detects live processes", () => {
    expect(
      buildDelegationUpdateEvent("updated", {
        id: "task-1",
        title: "Example",
        objective: "Run",
        status: "running",
        priority: "normal",
        executionMode: "delegated",
        orchestrationMode: "sequential",
        notes: [],
        createdAt: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-30T00:00:00.000Z",
      }),
    ).toEqual({
      kind: "updated",
      taskId: "task-1",
      status: "running",
      detail: "Example (running)",
    });
    expect(isDelegationProcessAlive(process.pid)).toBe(true);
    expect(isDelegationProcessAlive(-1)).toBe(false);
  });
});
