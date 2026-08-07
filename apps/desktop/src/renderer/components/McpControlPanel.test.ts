import { describe, expect, it } from "vitest";
import {
  mcpStatusLabel,
  normalizeMcpServers,
  normalizeMcpTools,
} from "./McpControlPanel";

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
    expect(
      mcpStatusLabel({ enabled: true, serverCount: 2, connectedServers: 1 }),
    ).toBe("Connecting");
    expect(
      mcpStatusLabel({ enabled: true, serverCount: 2, connectedServers: 2 }),
    ).toBe("Connected");
    expect(mcpStatusLabel({ enabled: true, failedServers: 1 })).toBe(
      "Needs attention",
    );
  });
});

describe("normalizeMcpServers", () => {
  it("projects official server status and resource counts", () => {
    expect(
      normalizeMcpServers([
        {
          name: "research",
          status: "connected",
          toolCount: 4,
          resourceCount: 2,
          resourceTemplateCount: 1,
        },
      ]),
    ).toEqual([
      {
        name: "research",
        status: "connected",
        toolCount: 4,
        resourceCount: 2,
        resourceTemplateCount: 1,
        error: "",
      },
    ]);
  });
});
