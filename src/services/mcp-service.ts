import type { McpToolDefinition } from "@/types";

interface McpSettings {
  serverCommand: string;
  timeoutMs: number;
}

interface McpCommandResult {
  ok: boolean;
  output: string;
  exitCode: number;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function buildShellCommand(command: string, args: string[]): string {
  const suffix = args.map((arg) => shellQuote(arg)).join(" ");
  return suffix ? `${command} ${suffix}` : command;
}

export class McpService {
  private discoveredTools: McpToolDefinition[] = [];
  private lastProbeAt?: string;
  private lastDiscoveryAt?: string;
  private lastInvocationAt?: string;
  private lastError?: string;

  constructor(private readonly getSettings: () => McpSettings) {}

  status(): {
    enabled: boolean;
    detail: string;
    command?: string;
    timeoutMs: number;
    discoveredTools: number;
    cachedToolNames: string[];
    lastProbeAt?: string;
    lastDiscoveryAt?: string;
    lastInvocationAt?: string;
    lastError?: string;
  } {
    const settings = this.getSettings();
    return {
      enabled: Boolean(settings.serverCommand),
      detail: settings.serverCommand
        ? `MCP bridge command is configured for structured discovery and invocation. Cached tools: ${this.discoveredTools.length}.`
        : "MCP bridge surface is reserved locally but no MCP client is configured yet.",
      command: settings.serverCommand || undefined,
      timeoutMs: settings.timeoutMs,
      discoveredTools: this.discoveredTools.length,
      cachedToolNames: this.discoveredTools.map((tool) => tool.name),
      lastProbeAt: this.lastProbeAt,
      lastDiscoveryAt: this.lastDiscoveryAt,
      lastInvocationAt: this.lastInvocationAt,
      lastError: this.lastError,
    };
  }

  async probe(): Promise<{
    ok: boolean;
    detail: string;
  }> {
    const result = await this.run(["--help"], 5_000);
    this.lastProbeAt = new Date().toISOString();
    if (!result.ok) {
      this.lastError = result.output || `MCP command failed with exit code ${result.exitCode}.`;
    } else {
      this.lastError = undefined;
    }
    return {
      ok: result.ok,
      detail: result.ok
        ? result.output || "MCP command responded successfully."
        : result.output || `MCP command failed with exit code ${result.exitCode}.`,
    };
  }

  async discoverTools(): Promise<{
    ok: boolean;
    tools: McpToolDefinition[];
    detail: string;
  }> {
    const jsonResult = await this.run(["list-tools", "--json"]);
    if (jsonResult.ok) {
      const parsed = this.tryParseTools(jsonResult.output);
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

    const tools = fallbackResult.output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, ...descriptionParts] = line.split(" - ");
        return {
          name,
          description: descriptionParts.join(" - ") || "MCP-discovered tool.",
        } satisfies McpToolDefinition;
    });

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
    const args = input.trim() ? input.trim().split(/\s+/) : [];
    const result = await this.run(args);
    this.lastInvocationAt = new Date().toISOString();
    if (!result.ok) {
      this.lastError = result.output || `MCP command failed with exit code ${result.exitCode}.`;
    } else {
      this.lastError = undefined;
    }
    return {
      ok: result.ok,
      output: result.output || (result.ok ? "(empty)" : `MCP command failed with exit code ${result.exitCode}.`),
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
      this.lastError = result.output || `MCP command failed with exit code ${result.exitCode}.`;
    } else {
      this.lastError = undefined;
    }
    return {
      ok: result.ok,
      tool: name,
      output: result.output || (result.ok ? "(empty)" : `MCP command failed with exit code ${result.exitCode}.`),
    };
  }

  getCachedTools(): McpToolDefinition[] {
    return [...this.discoveredTools];
  }

  getTool(name: string): McpToolDefinition | undefined {
    return this.discoveredTools.find((tool) => tool.name === name);
  }

  searchCachedTools(query: string): McpToolDefinition[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return this.getCachedTools();
    }
    return this.discoveredTools.filter((tool) =>
      [tool.name, tool.description, JSON.stringify(tool.inputSchema ?? {})]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }

  describeCachedTools(limit = 20): string {
    const tools = this.getCachedTools().slice(0, limit);
    return tools.length
      ? tools
          .map(
            (tool) =>
              `- ${tool.name}${tool.description ? `\n  ${tool.description}` : ""}${
                tool.inputSchema ? `\n  schema=${JSON.stringify(tool.inputSchema)}` : ""
              }`,
          )
          .join("\n\n")
      : "No MCP tools have been cached yet.";
  }

  describeTool(name: string): string {
    const tool = this.getTool(name);
    if (!tool) {
      return `Tool not found: ${name}`;
    }
    return [
      `MCP TOOL: ${tool.name}`,
      tool.description ? `Description: ${tool.description}` : undefined,
      tool.inputSchema ? `Schema: ${JSON.stringify(tool.inputSchema, null, 2)}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async run(args: string[], overrideTimeoutMs?: number): Promise<McpCommandResult> {
    const settings = this.getSettings();
    if (!settings.serverCommand) {
      this.lastError = "MCP_SERVER_COMMAND is not configured.";
      return {
        ok: false,
        output: "MCP_SERVER_COMMAND is not configured.",
        exitCode: 1,
      };
    }

    const proc = Bun.spawn({
      cmd: ["/bin/zsh", "-lc", buildShellCommand(settings.serverCommand, args)],
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => proc.kill(), overrideTimeoutMs ?? settings.timeoutMs);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]).finally(() => clearTimeout(timer));

    return {
      ok: exitCode === 0,
      output: (exitCode === 0 ? stdout : stderr || stdout).trim(),
      exitCode,
    };
  }

  private tryParseTools(raw: string): McpToolDefinition[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .flatMap((entry) => {
          if (entry && typeof entry === "object" && "tools" in entry && Array.isArray((entry as Record<string, unknown>).tools)) {
            return (entry as Record<string, unknown>).tools as Record<string, unknown>[];
          }
          return [entry];
        })
        .filter((entry) => entry && typeof entry === "object" && "name" in entry)
        .map((entry) => ({
          name: String((entry as Record<string, unknown>).name),
          description: String((entry as Record<string, unknown>).description ?? "MCP-discovered tool."),
          inputSchema:
            typeof (entry as Record<string, unknown>).inputSchema === "object"
              ? ((entry as Record<string, unknown>).inputSchema as Record<string, unknown>)
              : undefined,
        }));
    } catch {
      return [];
    }
  }
}
