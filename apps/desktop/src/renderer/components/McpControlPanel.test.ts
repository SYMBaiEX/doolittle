import { describe, expect, it } from "vitest";
import { mcpStatusLabel, normalizeMcpTools } from "./McpControlPanel";

describe("normalizeMcpTools", () => {
  it("normalizes cached definitions and ignores invalid rows", () => {
    expect(
      normalizeMcpTools([
        {
          name: "calendar_search",
          description: "Search calendar events",
          inputSchema: {
            properties: {
              query: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
        { description: "missing name" },
      ]),
    ).toEqual([
      {
        name: "calendar_search",
        description: "Search calendar events",
        inputCount: 2,
      },
    ]);
  });
});

describe("mcpStatusLabel", () => {
  it("describes configured and pending states", () => {
    expect(mcpStatusLabel(undefined)).toBe("Checking");
    expect(mcpStatusLabel({ enabled: false })).toBe("Not configured");
    expect(mcpStatusLabel({ enabled: true })).toBe("Connected");
  });
});
