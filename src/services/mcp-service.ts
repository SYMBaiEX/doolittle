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

  constructor(private readonly getSettings: () => McpSettings) {}

  status(): {
    enabled: boolean;
    detail: string;
    command?: string;
    timeoutMs: number;
    discoveredTools: number;
  } {
    const settings = this.getSettings();
    return {
      enabled: Boolean(settings.serverCommand),
      detail: settings.serverCommand
        ? "MCP bridge command is configured for structured discovery and invocation."
        : "MCP bridge surface is reserved locally but no MCP client is configured yet.",
      command: settings.serverCommand || undefined,
      timeoutMs: settings.timeoutMs,
      discoveredTools: this.discoveredTools.length,
    };
  }

  async probe(): Promise<{
    ok: boolean;
    detail: string;
  }> {
    const result = await this.run(["--help"], 5_000);
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
        return {
          ok: true,
          tools: parsed,
          detail: `Discovered ${parsed.length} MCP tools from structured JSON output.`,
        };
      }
    }

    const fallbackResult = await this.run(["list-tools"]);
    if (!fallbackResult.ok) {
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
    return {
      ok: result.ok,
      tool: name,
      output: result.output || (result.ok ? "(empty)" : `MCP command failed with exit code ${result.exitCode}.`),
    };
  }

  getCachedTools(): McpToolDefinition[] {
    return [...this.discoveredTools];
  }

  private async run(args: string[], overrideTimeoutMs?: number): Promise<McpCommandResult> {
    const settings = this.getSettings();
    if (!settings.serverCommand) {
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
