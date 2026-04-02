import { spawnSync } from "node:child_process";
import {
  CLAUDE_CODE_SYSTEM_PREFIX,
  CLAUDE_CODE_VERSION_FALLBACK,
} from "./constants";

export function getClaudeCodeVersion(): string {
  for (const command of ["claude", "claude-code"]) {
    try {
      const result = spawnSync(command, ["--version"], {
        encoding: "utf8",
        timeout: 5000,
      });
      const version = result.stdout?.trim().split(/\s+/)[0];
      if (result.status === 0 && version && /^\d/.test(version)) {
        return version;
      }
    } catch {}
  }
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
}): Promise<string> {
  const args = [
    "-p",
    params.prompt,
    "--output-format",
    "text",
    "--model",
    params.model,
  ];

  if (params.appendSystemPrompt?.trim()) {
    args.push("--append-system-prompt", params.appendSystemPrompt.trim());
  }

  const result = spawnSync("claude", args, {
    encoding: "utf8",
    timeout: 120_000,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      `Claude Code CLI invocation failed${typeof result.status === "number" ? ` (${result.status})` : ""}: ${detail || "Unknown error"}`,
    );
  }

  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}
