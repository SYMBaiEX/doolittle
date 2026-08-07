import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { McpService } from "./service";

const service = new McpService(() => ({
  servers: {
    primary: { type: "stdio", command: "mcp-server" },
  },
  maxRetries: 2,
}));
const calls: Array<{
  serverName: string;
  toolName: string;
  input?: Readonly<Record<string, unknown>>;
}> = [];

service.bindRuntime({
  getService: () => ({
    waitForInitialization: async () => {},
    getServers: () => [
      {
        name: "primary",
        status: "connected",
        tools: [
          { name: "echo", description: "Echo a value." },
          { name: "sum", description: "Sum two numbers." },
        ],
      },
    ],
    callTool: async (
      serverName: string,
      toolName: string,
      input?: Readonly<Record<string, unknown>>,
    ) => {
      calls.push({ serverName, toolName, input });
      return {
        content: [
          {
            type: "text",
            text: String(Number(input?.a) + Number(input?.b)),
          },
        ],
      };
    },
  }),
} as unknown as IAgentRuntime);

describe("McpService", () => {
  it("discovers structured tools", async () => {
    const result = await service.discoverTools();
    expect(result.ok).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools.some((tool) => tool.name === "primary:echo")).toBe(
      true,
    );
    expect(service.status().discoveredTools).toBe(result.tools.length);
    expect(service.status().cachedToolNames).toContain("primary:echo");
    expect(
      service
        .searchCachedTools("sum")
        .some((tool) => tool.name === "primary:sum"),
    ).toBe(true);
  });

  it("invokes a structured tool", async () => {
    const result = await service.invokeTool("sum", { a: 2, b: 5 });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("7");
    expect(calls.at(-1)).toMatchObject({
      serverName: "primary",
      toolName: "sum",
    });
    expect(service.describeTool("primary:sum")).toContain(
      "MCP TOOL: primary:sum",
    );
    expect(service.describeCachedTools()).toContain("Sum two numbers.");
  });

  it("reports a degraded projection when the official service is unavailable", () => {
    const degraded = new McpService(() => ({
      servers: {
        primary: { type: "stdio", command: "mcp-server" },
      },
      maxRetries: 2,
    }));
    degraded.bindRuntime({
      getService: () => undefined,
    } as unknown as IAgentRuntime);

    expect(degraded.status()).toMatchObject({
      enabled: true,
      connectedServers: 0,
      lastError: "Official Eliza MCP service is unavailable.",
    });
  });
});
