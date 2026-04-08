import { describe, expect, test } from "bun:test";
import { applyOperation, applyOperationsToLines } from "./engine";

describe("fuzzy patch engine", () => {
  test("applies a matching operation to lines", () => {
    const result = applyOperation(
      ["alpha", "bravo", "delta"],
      { search: ["bravo"], replace: ["charlie"] },
      {
        maxEditDistance: 4,
        contextMatchRatio: 0.6,
        write: false,
        dryRun: true,
      },
    );

    expect(result.applied).toBe(true);
    expect(result.lines).toEqual(["alpha", "charlie", "delta"]);
  });

  test("reports a missing search block", () => {
    const result = applyOperationsToLines(
      "alpha\nbravo",
      [{ search: ["charlie"], replace: ["delta"] }],
      {
        maxEditDistance: 4,
        contextMatchRatio: 0.6,
        write: false,
        dryRun: true,
      },
    );

    expect(result.appliedHunks).toBe(0);
    expect(result.failedHunks).toBe(1);
    expect(result.errors[0]).toContain("Could not locate search block");
  });
});
