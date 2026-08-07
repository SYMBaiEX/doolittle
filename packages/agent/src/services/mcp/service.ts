import type { IAgentRuntime } from "@elizaos/core";
import type { McpToolDefinition } from "@/types";
import type { ElizaMcpSettings } from "./settings";
import { createMcpServiceStatus } from "./status";
import {
  describeCachedMcpTool,
  describeCachedMcpTools,
  findCachedMcpTool,
  searchCachedMcpTools,
} from "./tools";

interface OfficialMcpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface OfficialMcpServer {
  name: string;
  status: "connecting" | "connected" | "disconnected";
  error?: string;
  tools?: readonly OfficialMcpTool[];
  resources?: readonly unknown[];
  resourceTemplates?: readonly unknown[];
}

interface OfficialMcpToolResult {
  content?: readonly unknown[];
  isError?: boolean;
}

interface OfficialMcpService {
  waitForInitialization(): Promise<void>;
  getServers(): OfficialMcpServer[];
  callTool(
    serverName: string,
    toolName: string,
    input?: Readonly<Record<string, unknown>>,
  ): Promise<OfficialMcpToolResult>;
}

export class McpService {
  private discoveredTools: McpToolDefinition[] = [];
  private lastProbeAt?: string;
  private lastDiscoveryAt?: string;
  private lastInvocationAt?: string;
  private lastError?: string;

  private runtime?: IAgentRuntime;

  constructor(private readonly getSettings: () => ElizaMcpSettings) {}

  bindRuntime(runtime: IAgentRuntime): void {
    this.runtime = runtime;
  }

  status() {
    const official = this.lookupOfficial();
    const servers = official?.getServers() ?? [];
    const tools = this.flattenTools(servers);
    this.discoveredTools = tools;
    if (this.runtime && !official) {
      this.lastError = "Official Eliza MCP service is unavailable.";
    }
    return createMcpServiceStatus({
      configuredServers: Object.keys(this.getSettings().servers).length,
      connectedServers: servers.filter(
        (server) => server.status === "connected",
      ).length,
      failedServers: servers.filter(
        (server) => server.status === "disconnected" || Boolean(server.error),
      ).length,
      discoveredTools: tools.map((tool) => tool.name),
      servers: servers.map((server) => ({
        name: server.name,
        status: server.status,
        toolCount: server.tools?.length ?? 0,
        resourceCount: server.resources?.length ?? 0,
        resourceTemplateCount: server.resourceTemplates?.length ?? 0,
        ...(server.error ? { error: server.error } : {}),
      })),
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
    try {
      const service = this.official();
      await service.waitForInitialization();
      const servers = service.getServers();
      const connected = servers.filter(
        (server) => server.status === "connected",
      ).length;
      const configured = Object.keys(this.getSettings().servers).length;
      this.lastProbeAt = new Date().toISOString();
      this.lastError = undefined;
      return {
        ok: configured === 0 || connected === configured,
        detail:
          configured === 0
            ? "Official Eliza MCP service is loaded; no servers are configured."
            : `${connected}/${configured} configured MCP servers are connected through Eliza.`,
      };
    } catch (error) {
      this.lastProbeAt = new Date().toISOString();
      this.lastError = errorMessage(error);
      return { ok: false, detail: this.lastError };
    }
  }

  async discoverTools(): Promise<{
    ok: boolean;
    tools: McpToolDefinition[];
    detail: string;
  }> {
    try {
      const service = this.official();
      await service.waitForInitialization();
      const tools = this.flattenTools(service.getServers());
      this.discoveredTools = tools;
      this.lastDiscoveryAt = new Date().toISOString();
      this.lastError = undefined;
      return {
        ok: true,
        tools,
        detail: `Read ${tools.length} tools from the official Eliza MCP service.`,
      };
    } catch (error) {
      this.lastError = errorMessage(error);
      return {
        ok: false,
        tools: [],
        detail: this.lastError,
      };
    }
  }

  async invoke(input: string): Promise<{
    ok: boolean;
    output: string;
  }> {
    const separator = input.indexOf("::");
    if (separator < 0) {
      return {
        ok: false,
        output: "Usage: <server:tool> :: <json-input>",
      };
    }
    const name = input.slice(0, separator).trim();
    const rawInput = input.slice(separator + 2).trim();
    try {
      const parsed = rawInput
        ? (JSON.parse(rawInput) as Record<string, unknown>)
        : {};
      const result = await this.invokeTool(name, parsed);
      return { ok: result.ok, output: result.output };
    } catch (error) {
      return { ok: false, output: `Invalid MCP input: ${errorMessage(error)}` };
    }
  }

  async invokeTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    tool: string;
    output: string;
  }> {
    try {
      const service = this.official();
      await service.waitForInitialization();
      const tool = this.resolveTool(name, service.getServers());
      const result = await service.callTool(
        tool.serverName,
        tool.toolName,
        input,
      );
      this.lastInvocationAt = new Date().toISOString();
      const output = formatToolResult(result);
      if (result.isError) {
        this.lastError = output;
      } else {
        this.lastError = undefined;
      }
      return { ok: !result.isError, tool: tool.name, output };
    } catch (error) {
      this.lastInvocationAt = new Date().toISOString();
      this.lastError = errorMessage(error);
      return { ok: false, tool: name, output: this.lastError };
    }
  }

  getCachedTools(): McpToolDefinition[] {
    const official = this.lookupOfficial();
    if (official) {
      this.discoveredTools = this.flattenTools(official.getServers());
    }
    return [...this.discoveredTools];
  }

  getTool(name: string): McpToolDefinition | undefined {
    return findCachedMcpTool(this.getCachedTools(), name);
  }

  searchCachedTools(query: string): McpToolDefinition[] {
    return searchCachedMcpTools(this.getCachedTools(), query);
  }

  describeCachedTools(limit = 20): string {
    return describeCachedMcpTools(this.getCachedTools(), limit);
  }

  describeTool(name: string): string {
    return describeCachedMcpTool(this.getTool(name), name);
  }

  private official(): OfficialMcpService {
    const service = this.lookupOfficial();
    if (!service) {
      throw new Error("Official Eliza MCP service is unavailable.");
    }
    return service;
  }

  private lookupOfficial(): OfficialMcpService | undefined {
    return this.runtime?.getService("mcp") as OfficialMcpService | undefined;
  }

  private flattenTools(servers: readonly OfficialMcpServer[]) {
    return servers.flatMap((server) =>
      (server.tools ?? []).map(
        (tool): McpToolDefinition => ({
          name: `${server.name}:${tool.name}`,
          serverName: server.name,
          toolName: tool.name,
          description: tool.description ?? "MCP-discovered tool.",
          inputSchema: tool.inputSchema,
        }),
      ),
    );
  }

  private resolveTool(
    name: string,
    servers: readonly OfficialMcpServer[],
  ): McpToolDefinition {
    const tools = this.flattenTools(servers);
    const exact = tools.find((tool) => tool.name === name);
    if (exact) return exact;
    const matches = tools.filter((tool) => tool.toolName === name);
    if (matches.length === 1 && matches[0]) return matches[0];
    if (matches.length > 1) {
      throw new Error(
        `MCP tool ${name} is ambiguous; use server:tool (${matches.map((tool) => tool.name).join(", ")}).`,
      );
    }
    throw new Error(`MCP tool not found: ${name}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatToolResult(result: OfficialMcpToolResult): string {
  const content = result.content ?? [];
  const text = content
    .filter(
      (entry): entry is { type: "text"; text: string } =>
        Boolean(entry) &&
        typeof entry === "object" &&
        (entry as { type?: unknown }).type === "text" &&
        typeof (entry as { text?: unknown }).text === "string",
    )
    .map((entry) => entry.text)
    .join("\n");
  return text || (content.length ? JSON.stringify(content) : "(empty)");
}
