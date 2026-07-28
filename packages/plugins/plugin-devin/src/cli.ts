import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runShell } from "@elizaos/agent/services/shell-execution-router";
import type { DevinCliPrintParams } from "./types";

export const DEFAULT_DEVIN_COMMAND = "devin";
export const DEFAULT_DEVIN_MODEL = "swe-1-6-fast";
export const DEFAULT_DEVIN_TIMEOUT_MS = 120_000;
const ANSI_ESCAPE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
  "gu",
);

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, "");
}

async function runDevinProcess(
  command: string,
  args: string[],
  params: DevinCliPrintParams,
): Promise<string> {
  const timeoutMs = params.timeoutMs ?? DEFAULT_DEVIN_TIMEOUT_MS;
  const result = await runShell({
    command,
    args,
    cwd: params.cwd,
    env: {
      DEVIN_MODEL: params.model,
      DEVIN_PERMISSION_MODE: params.permissionMode ?? "auto",
      NO_COLOR: "1",
    },
    timeoutMs,
    toolName: "doolittle.provider.devin",
  });
  const cleanStdout = stripAnsi(result.stdout).trim();
  const cleanStderr = stripAnsi(result.stderr).trim();
  if (
    result.exitCode === 124 &&
    result.stderr.includes("[shell-router] command timed out")
  ) {
    throw new Error(
      `Devin CLI invocation timed out after ${timeoutMs}ms. Partial output: ${
        cleanStdout || cleanStderr || "none"
      }`,
    );
  }
  if (result.exitCode !== 0) {
    const detail = [cleanStdout, cleanStderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `Devin CLI invocation failed (${result.exitCode}): ${
        detail || "Unknown error"
      }`,
    );
  }
  return cleanStdout || cleanStderr;
}

export async function invokeDevinCliPrint(
  params: DevinCliPrintParams,
): Promise<string> {
  const command = params.command?.trim() || DEFAULT_DEVIN_COMMAND;
  const model = params.model?.trim() || DEFAULT_DEVIN_MODEL;
  const permissionMode = params.permissionMode ?? "auto";
  const tempDir = await mkdtemp(join(tmpdir(), "doolittle-devin-"));
  try {
    const promptFile = join(tempDir, "prompt.txt");
    await writeFile(promptFile, params.prompt, "utf8");
    return await runDevinProcess(
      command,
      [
        "-p",
        "--model",
        model,
        "--permission-mode",
        permissionMode,
        "--prompt-file",
        promptFile,
      ],
      {
        ...params,
        model,
        permissionMode,
      },
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}
