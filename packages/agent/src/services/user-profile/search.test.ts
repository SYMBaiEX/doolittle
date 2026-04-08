import { describe, expect, it } from "bun:test";
import { searchProfiles } from "./search";
import { createEmptyProfile } from "./storage";

describe("user-profile search helpers", () => {
  it("ranks exact matches ahead of partial matches and respects limits", () => {
    const exact = createEmptyProfile("user-exact");
    exact.displayName = "Bun";
    exact.notes.push("Bun");

    const partial = createEmptyProfile("user-partial");
    partial.displayName = "Bun Helper";
    partial.notes.push("Bun runtime helper");

    const results = searchProfiles(
      {
        list() {
          return [partial, exact];
        },
      },
      "Bun",
      1,
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.userId).toBe("user-exact");
    expect(results[0]?.matchedFields).toContain("displayName");
    expect(results[0]?.preview.length).toBeGreaterThan(0);
  });

  it("returns no results for blank queries", () => {
    const results = searchProfiles(
      {
        list() {
          return [createEmptyProfile("user-empty")];
        },
      },
      "   ",
    );

    expect(results).toEqual([]);
  });
});
