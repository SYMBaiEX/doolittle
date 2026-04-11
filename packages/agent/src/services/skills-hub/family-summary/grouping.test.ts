import { describe, expect, it } from "bun:test";
import { incrementGroupedCount, mapToSortedGroupedRecords } from "./grouping";

describe("skill hub grouping helpers", () => {
  it("tracks source-specific grouped counts", () => {
    const groups = new Map<
      string,
      {
        count: number;
        workspace: number;
        generated: number;
        catalog: number;
        installed: number;
      }
    >();

    incrementGroupedCount(groups, "planning", "workspace");
    incrementGroupedCount(groups, "planning", "generated");
    incrementGroupedCount(groups, "planning", "catalog");
    incrementGroupedCount(groups, "planning", "installed");
    incrementGroupedCount(groups, "", "workspace");

    expect(groups.get("planning")).toEqual({
      count: 4,
      workspace: 1,
      generated: 1,
      catalog: 1,
      installed: 1,
    });
    expect(groups.has("")).toBe(false);
  });

  it("maps groups to sorted records", () => {
    const groups = new Map();
    groups.set("b", {
      count: 1,
      workspace: 1,
      generated: 0,
      catalog: 0,
      installed: 0,
    });
    groups.set("a", {
      count: 2,
      workspace: 0,
      generated: 1,
      catalog: 0,
      installed: 1,
    });

    const records = mapToSortedGroupedRecords(groups);
    expect(records[0]?.name).toBe("a");
    expect(records[1]?.name).toBe("b");
  });
});
