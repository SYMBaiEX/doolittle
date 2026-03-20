import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AcpRegistryEntry,
  AcpToolDefinition,
  AcpToolKind,
  EnvConfig,
  ToolDefinition,
} from "@/types";

interface AcpCommandResult {
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

function guessToolKind(tool: ToolDefinition): AcpToolKind {
  if (
    tool.id.startsWith("workspace.read") ||
    tool.id.startsWith("browser.snapshot")
  ) {
    return "read";
  }
  if (
    tool.id.startsWith("workspace.write") ||
    tool.id.startsWith("gateway.edit") ||
    tool.id.startsWith("browser.compare")
  ) {
    return "edit";
  }
  if (
    tool.id.startsWith("workspace.search") ||
    tool.id.startsWith("mcp") ||
    tool.id.startsWith("acp")
  ) {
    return "search";
  }
  if (
    tool.id.startsWith("terminal.run") ||
    tool.id.startsWith("repository") ||
    tool.id.startsWith("gateway.send") ||
    tool.id.startsWith("media.generate") ||
    tool.id.startsWith("media.speak")
  ) {
    return "execute";
  }
  if (
    tool.id.startsWith("web.") ||
    tool.id.startsWith("browser.") ||
    tool.id.startsWith("documents.")
  ) {
    return "fetch";
  }
  if (tool.id.startsWith("automation.") || tool.id.startsWith("delegate")) {
    return "think";
  }
  return "other";
}

export class AcpService {
  private readonly registryDir: string;
  private readonly registryPath: string;
  private lastProbeAt?: string;
  private lastInvocationAt?: string;
  private lastPublishAt?: string;
  private lastError?: string;

  constructor(
    private readonly config: EnvConfig,
    private readonly getTools: () => ToolDefinition[],
  ) {
    this.registryDir = join(this.config.dataDir, "acp");
    this.registryPath = join(this.registryDir, "agent.json");
    mkdirSync(this.registryDir, { recursive: true });
  }

  status() {
    const tools = this.tools();
    return {
      enabled: Boolean(this.config.acpServerCommand),
      detail: this.config.acpServerCommand
        ? `ACP bridge command is configured for Eliza Agent editor and protocol integrations. Tools: ${tools.length}.`
        : "ACP bridge surface is available locally, but ACP_SERVER_COMMAND is not configured yet.",
      command: this.config.acpServerCommand,
      timeoutMs: this.config.acpTimeoutMs,
      registryPath: this.registryPath,
      toolCount: tools.length,
      lastProbeAt: this.lastProbeAt,
      lastInvocationAt: this.lastInvocationAt,
      lastPublishAt: this.lastPublishAt,
      lastError: this.lastError,
    };
  }

  registry(): AcpRegistryEntry {
    const command = this.config.acpServerCommand?.trim();
    return {
      schema_version: 1,
      name: "eliza-agent",
      display_name: this.config.agentName,
      description:
        "Eliza Agent on ElizaOS with persistent memory, gateway transports, execution backends, and research tooling.",
      distribution: command
        ? {
            type: "command",
            command: "/bin/zsh",
            args: ["-lc", command],
          }
        : {
            type: "command",
            command: "bun",
            args: ["run", "start", "--cli"],
          },
      capabilities: {
        tools: this.tools().length,
      },
    };
  }

  publishRegistry(): { path: string; entry: AcpRegistryEntry } {
    const entry = this.registry();
    writeFileSync(this.registryPath, JSON.stringify(entry, null, 2), "utf8");
    this.lastPublishAt = new Date().toISOString();
    return {
      path: this.registryPath,
      entry,
    };
  }

  tools(): AcpToolDefinition[] {
    return this.getTools().map((tool) => ({
      name: tool.id,
      description: tool.description,
      kind: guessToolKind(tool),
      source: tool.transport === "native" ? "mcp" : "eliza-agent",
    }));
  }

  searchTools(query: string): AcpToolDefinition[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return this.tools();
    }
    return this.tools().filter((tool) =>
      [tool.name, tool.description, tool.kind, tool.source]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }

  describeTool(name: string): string {
    const tool = this.tools().find((entry) => entry.name === name);
    if (!tool) {
      return `ACP tool not found: ${name}`;
    }
    return [
      `ACP TOOL: ${tool.name}`,
      `Kind: ${tool.kind}`,
      `Source: ${tool.source}`,
      `Description: ${tool.description}`,
    ].join("\n");
  }

  async probe(): Promise<{ ok: boolean; detail: string }> {
    const result = await this.run(["--help"], 5_000);
    this.lastProbeAt = new Date().toISOString();
    this.lastError = result.ok ? undefined : result.output;
    return {
      ok: result.ok,
      detail:
        result.output ||
        (result.ok
          ? "ACP command responded successfully."
          : `ACP command failed with exit code ${result.exitCode}.`),
    };
  }

  async invoke(input: string): Promise<{ ok: boolean; output: string }> {
    const args = input.trim() ? input.trim().split(/\s+/u) : [];
    const result = await this.run(args);
    this.lastInvocationAt = new Date().toISOString();
    this.lastError = result.ok ? undefined : result.output;
    return {
      ok: result.ok,
      output:
        result.output ||
        (result.ok
          ? "(empty)"
          : `ACP command failed with exit code ${result.exitCode}.`),
    };
  }

  async invokeTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<{ ok: boolean; tool: string; output: string }> {
    const result = await this.run(["call-tool", name, JSON.stringify(input)]);
    this.lastInvocationAt = new Date().toISOString();
    this.lastError = result.ok ? undefined : result.output;
    return {
      ok: result.ok,
      tool: name,
      output:
        result.output ||
        (result.ok
          ? "(empty)"
          : `ACP command failed with exit code ${result.exitCode}.`),
    };
  }

  private async run(
    args: string[],
    overrideTimeoutMs?: number,
  ): Promise<AcpCommandResult> {
    const command = this.config.acpServerCommand?.trim();
    if (!command) {
      this.lastError = "ACP_SERVER_COMMAND is not configured.";
      return {
        ok: false,
        output: "ACP_SERVER_COMMAND is not configured.",
        exitCode: 1,
      };
    }

    const proc = Bun.spawn({
      cmd: ["/bin/zsh", "-lc", buildShellCommand(command, args)],
      stdout: "pipe",
      stderr: "pipe",
    });

    const timer = setTimeout(
      () => proc.kill(),
      overrideTimeoutMs ?? this.config.acpTimeoutMs,
    );

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    clearTimeout(timer);
    return {
      ok: exitCode === 0,
      output: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n"),
      exitCode,
    };
  }
}
