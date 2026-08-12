import { describe, expect, it } from "vitest";
import { filterToolEntries, toolEntryCategories } from "./tool-catalog-filter";

describe("tool catalog filter", () => {
  const entries = [
    {
      id: "READ_FILE",
      category: "workspace",
      transport: "native",
      similes: ["OPEN_FILE"],
      allowedProfiles: ["coding", "full"],
    },
    { id: "SEND_MESSAGE", category: "messaging", transport: "native" },
  ];

  it("searches aliases, profile access, and transport", () => {
    expect(filterToolEntries(entries, "open_file", "all")).toEqual([
      entries[0],
    ]);
    expect(filterToolEntries(entries, "coding", "all")).toEqual([entries[0]]);
    expect(filterToolEntries(entries, "native", "workspace")).toEqual([
      entries[0],
    ]);
    expect(filterToolEntries(entries, "mcp", "messaging")).toEqual([]);
  });

  it("derives categories without adding presentation groups", () => {
    expect(toolEntryCategories(entries)).toEqual([
      "all",
      "workspace",
      "messaging",
    ]);
  });
});
