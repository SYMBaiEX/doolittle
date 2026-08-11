import { describe, expect, it } from "vitest";
import {
  mcpLiveStatus,
  mcpStatusLabel,
  normalizeMcpMarketplace,
  normalizeMcpMarketplaceDetail,
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

describe("mcpLiveStatus", () => {
  it("summarizes connection counts and announces selected read-only details", () => {
    expect(
      mcpLiveStatus(
        { enabled: true, serverCount: 2, connectedServers: 1 },
        4,
        "calendar_search",
        "io.example/calendar",
      ),
    ).toBe(
      "MCP connecting. 1 of 2 servers connected. 4 cached tools. Tool details selected: calendar_search. Registry definition selected: io.example/calendar.",
    );
  });

  it("does not announce an empty registry before MCP status is available", () => {
    expect(mcpLiveStatus(undefined, 0)).toBe("Checking MCP connections.");
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

describe("MCP marketplace projections", () => {
  it("normalizes official search rows without accepting configuration", () => {
    expect(
      normalizeMcpMarketplace([
        {
          name: "io.example/research",
          title: "Research",
          description: "Searches primary sources",
          version: "1.2.3",
          connectionType: "remote",
          repositoryUrl: "https://github.com/example/research",
          isLatest: true,
        },
        {
          name: "io.example/unsafe-link",
          repositoryUrl: "javascript:alert('unsafe')",
        },
        { title: "missing name" },
      ]),
    ).toEqual([
      {
        name: "io.example/research",
        title: "Research",
        description: "Searches primary sources",
        version: "1.2.3",
        connectionType: "remote",
        repositoryUrl: "https://github.com/example/research",
        isLatest: true,
      },
      {
        name: "io.example/unsafe-link",
        title: "io.example/unsafe-link",
        description: "No description provided.",
        version: "Unknown",
        connectionType: "unknown",
        repositoryUrl: "",
        isLatest: false,
      },
    ]);
  });

  it("surfaces requirements while retaining an official generated preview", () => {
    expect(
      normalizeMcpMarketplaceDetail(
        {
          name: "io.example/research",
          version: "1.2.3",
          repository: { url: "https://github.com/example/research" },
          remotes: [
            {
              type: "streamable-http",
              headers: [
                { name: "Authorization", isRequired: true, isSecret: true },
              ],
            },
          ],
          packages: [
            {
              transport: { type: "stdio" },
              environmentVariables: [
                { name: "API_KEY", isRequired: true, isSecret: true },
              ],
            },
          ],
        },
        { type: "streamable-http", url: "https://mcp.example.com" },
      ),
    ).toEqual({
      name: "io.example/research",
      version: "1.2.3",
      repositoryUrl: "https://github.com/example/research",
      transports: ["streamable-http", "stdio"],
      environment: [
        { name: "API_KEY", description: "", required: true, secret: true },
      ],
      headers: [
        {
          name: "Authorization",
          description: "",
          required: true,
          secret: true,
        },
      ],
      config: { type: "streamable-http", url: "https://mcp.example.com" },
    });
  });
});
