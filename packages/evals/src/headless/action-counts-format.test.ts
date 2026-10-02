import { describe, expect, it } from "vitest";
import { formatActionCounts } from "./action-counts-format";

describe("formatActionCounts", () => {
  it("shows privacy-safe action counts when the journal is available", () => {
    expect(
      formatActionCounts({
        journalAvailable: true,
        actionStarts: 3,
        actionCompletions: 3,
        actionSuccesses: 2,
        actionFailures: 1,
      }),
    ).toBe("  Agent actions started 3 · completed 3 · succeeded 2 · failed 1.");
  });

  it("distinguishes a missing journal from zero actions", () => {
    expect(
      formatActionCounts({
        journalAvailable: false,
        actionStarts: 0,
        actionCompletions: 0,
        actionSuccesses: 0,
        actionFailures: 0,
      }),
    ).toBe("  Agent actions: telemetry unavailable.");
  });
});
