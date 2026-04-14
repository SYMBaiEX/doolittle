import type { EnvConfig } from "@/types";
import { runShellCommand } from "../command-process";

interface AcpCommandResult {
  ok: boolean;
  output: string;
  exitCode: number;
}

interface AcpProbeResult {
  ok: boolean;
  detail: string;
  rawOutput: string;
}

interface AcpInvokeResult {
  ok: boolean;
  output: string;
  rawOutput: string;
}

interface AcpInvokeToolResult extends AcpInvokeResult {
  tool: string;
}

export class AcpCommandRunner {
  constructor(
    private readonly config: Pick<
      EnvConfig,
      "acpServerCommand" | "acpTimeoutMs"
    >,
  ) {}

  async probe(): Promise<AcpProbeResult> {
    const result = await this.run(["--help"], 5_000);
    return {
      ok: result.ok,
      detail:
        result.output ||
        (result.ok
          ? "ACP command responded successfully."
          : `ACP command failed with exit code ${result.exitCode}.`),
      rawOutput: result.output,
    };
  }

  async invoke(input: string): Promise<AcpInvokeResult> {
    const args = input.trim() ? input.trim().split(/\s+/u) : [];
    const result = await this.run(args);
    return {
      ok: result.ok,
      output:
        result.output ||
        (result.ok
          ? "(empty)"
          : `ACP command failed with exit code ${result.exitCode}.`),
      rawOutput: result.output,
    };
  }

  async invokeTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<AcpInvokeToolResult> {
    const result = await this.run(["call-tool", name, JSON.stringify(input)]);
    return {
      ok: result.ok,
      tool: name,
      output:
        result.output ||
        (result.ok
          ? "(empty)"
          : `ACP command failed with exit code ${result.exitCode}.`),
      rawOutput: result.output,
    };
  }

  private async run(
    args: string[],
    overrideTimeoutMs?: number,
  ): Promise<AcpCommandResult> {
    const command = this.config.acpServerCommand?.trim();
    if (!command) {
      return {
        ok: false,
        output: "ACP_SERVER_COMMAND is not configured.",
        exitCode: 1,
      };
    }

    const result = await runShellCommand(
      command,
      args,
      overrideTimeoutMs ?? this.config.acpTimeoutMs,
    );

    return {
      ok: result.ok,
      output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
      exitCode: result.exitCode,
    };
  }
}
