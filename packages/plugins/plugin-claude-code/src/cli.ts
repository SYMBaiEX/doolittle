import { runShell } from "@elizaos/agent/services/shell-execution-router";
import { logger } from "@elizaos/core";
import {
  CLAUDE_CODE_SYSTEM_PREFIX,
  CLAUDE_CODE_VERSION_FALLBACK,
} from "./constants";

export function getClaudeCodeVersion(): string {
  // Keep module evaluation side-effect free; runtime commands use runShell.
  return CLAUDE_CODE_VERSION_FALLBACK;
}

export const CLAUDE_CODE_VERSION = getClaudeCodeVersion();

export function withClaudeCodeSystemPrefix(): Array<{
  type: "text";
  text: string;
}> {
  return [
    {
      type: "text",
      text: CLAUDE_CODE_SYSTEM_PREFIX,
    },
  ];
}

export async function invokeClaudeCodeCliPrint(params: {
  prompt: string;
  model: string;
  appendSystemPrompt?: string;
  effort?: string;
}): Promise<string> {
  const args = [
    "-p",
    params.prompt,
    "--output-format",
    "text",
    "--model",
    params.model,
    // Eliza owns planning, tools, approvals, and lifecycle. The linked Claude
    // CLI is an inference transport here, so prevent a second nested agent loop
    // from interpreting Eliza's response-handler prompt as a tool task.
    "--tools",
    "",
  ];

  if (params.effort?.trim()) {
    args.push("--effort", params.effort.trim());
  }

  if (params.appendSystemPrompt?.trim()) {
    args.push("--append-system-prompt", params.appendSystemPrompt.trim());
  }

  const result = await runShell({
    command: "claude",
    args,
    timeoutMs: 120_000,
    toolName: "doolittle.provider.claude-code",
  });

  if (result.exitCode !== 0) {
    const detail = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    logger.error(
      {
        exitCode: result.exitCode,
        detail: detail || "Unknown error",
      },
      "Claude Code CLI invocation failed",
    );
    throw new Error(
      `Claude Code CLI invocation failed (${result.exitCode}): ${detail || "Unknown error"}`,
    );
  }

  if (result.stderr.trim()) {
    logger.warn(
      { detail: result.stderr.trim() },
      "Claude Code CLI completed with diagnostics",
    );
  }
  return result.stdout.trim();
}
