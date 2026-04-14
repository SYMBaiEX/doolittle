import type { McpToolDefinition } from "@/types";
import {
  getMissingMcpCommandResult,
  type McpCommandResult,
  runMcpCommand,
} from "./command-runner";
import { createMcpServiceStatus, type McpSettings } from "./status";
import {
  describeCachedMcpTool,
  describeCachedMcpTools,
  findCachedMcpTool,
  parseLineOrientedMcpTools,
  parseStructuredMcpTools,
  searchCachedMcpTools,
} from "./tools";

export class McpService {
  private discoveredTools: McpToolDefinition[] = [];
  private lastProbeAt?: string;
  private lastDiscoveryAt?: string;
  private lastInvocationAt?: string;
  private lastError?: string;

  constructor(private readonly getSettings: () => McpSettings) {}

  status() {
    const settings = this.getSettings();
    return createMcpServiceStatus({
      command: settings.serverCommand?.trim(),
      timeoutMs: settings.timeoutMs,
      discoveredTools: this.discoveredTools.map((tool) => tool.name),
      lastProbeAt: this.lastProbeAt,
      lastDiscoveryAt: this.lastDiscoveryAt,
      lastInvocationAt: this.lastInvocationAt,
      lastError: this.lastError,
    });
  }

  async probe(): Promise<{
    ok: boolean;
    detail: string;
  }> {
    const result = await this.run(["--help"], 5_000);
    this.lastProbeAt = new Date().toISOString();
    if (!result.ok) {
      this.lastError =
        result.output ||
        `MCP command failed with exit code ${result.exitCode}.`;
    } else {
      this.lastError = undefined;
    }
    return {
      ok: result.ok,
      detail: result.ok
        ? result.output || "MCP command responded successfully."
        : result.output ||
          `MCP command failed with exit code ${result.exitCode}.`,
    };
  }

  async discoverTools(): Promise<{
    ok: boolean;
    tools: McpToolDefinition[];
    detail: string;
  }> {
    const jsonResult = await this.run(["list-tools", "--json"]);
    if (jsonResult.ok) {
      const parsed = parseStructuredMcpTools(jsonResult.output);
      if (parsed.length) {
        this.discoveredTools = parsed;
        this.lastDiscoveryAt = new Date().toISOString();
        this.lastError = undefined;
        return {
          ok: true,
          tools: parsed,
          detail: `Discovered ${parsed.length} MCP tools from structured JSON output.`,
        };
      }
    }

    const fallbackResult = await this.run(["list-tools"]);
    if (!fallbackResult.ok) {
      this.lastError = fallbackResult.output || "MCP tool discovery failed.";
      return {
        ok: false,
        tools: [],
        detail: fallbackResult.output || "MCP tool discovery failed.",
      };
    }

    const tools = parseLineOrientedMcpTools(fallbackResult.output);

    this.discoveredTools = tools;
    this.lastDiscoveryAt = new Date().toISOString();
    this.lastError = undefined;
    return {
      ok: true,
      tools,
      detail: `Discovered ${tools.length} MCP tools from line-oriented output.`,
    };
  }

  async invoke(input: string): Promise<{
    ok: boolean;
    output: string;
  }> {
    const args = input.trim() ? input.trim().split(/\s+/u) : [];
    const result = await this.run(args);
    this.lastInvocationAt = new Date().toISOString();
    if (!result.ok) {
      this.lastError =
        result.output ||
        `MCP command failed with exit code ${result.exitCode}.`;
    } else {
      this.lastError = undefined;
    }
    return {
      ok: result.ok,
      output:
        result.output ||
        (result.ok
          ? "(empty)"
          : `MCP command failed with exit code ${result.exitCode}.`),
    };
  }

  async invokeTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    tool: string;
    output: string;
  }> {
    const result = await this.run(["call-tool", name, JSON.stringify(input)]);
    this.lastInvocationAt = new Date().toISOString();
    if (!result.ok) {
      this.lastError =
        result.output ||
        `MCP command failed with exit code ${result.exitCode}.`;
    } else {
      this.lastError = undefined;
    }
    return {
      ok: result.ok,
      tool: name,
      output:
        result.output ||
        (result.ok
          ? "(empty)"
          : `MCP command failed with exit code ${result.exitCode}.`),
    };
  }

  getCachedTools(): McpToolDefinition[] {
    return [...this.discoveredTools];
  }

  getTool(name: string): McpToolDefinition | undefined {
    return findCachedMcpTool(this.discoveredTools, name);
  }

  searchCachedTools(query: string): McpToolDefinition[] {
    return searchCachedMcpTools(this.discoveredTools, query);
  }

  describeCachedTools(limit = 20): string {
    return describeCachedMcpTools(this.discoveredTools, limit);
  }

  describeTool(name: string): string {
    return describeCachedMcpTool(this.getTool(name), name);
  }

  private async run(
    args: string[],
    overrideTimeoutMs?: number,
  ): Promise<McpCommandResult> {
    const settings = this.getSettings();
    if (!settings.serverCommand) {
      this.lastError = "MCP_SERVER_COMMAND is not configured.";
      return getMissingMcpCommandResult();
    }
    return runMcpCommand(settings, args, overrideTimeoutMs);
  }
}
