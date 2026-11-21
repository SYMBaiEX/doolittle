import { access } from "node:fs/promises";
import { join } from "node:path";
import { runTextProcess } from "../process-execution";
import type { LocalProjectInspection } from "./types";

export async function inspectGitState(
  projectPath: string,
  signal?: AbortSignal,
): Promise<LocalProjectInspection["git"]> {
  signal?.throwIfAborted();
  try {
    await access(join(projectPath, ".git"));
  } catch {
    signal?.throwIfAborted();
    return { available: false };
  }

  const [status, recentCommit] = await Promise.all([
    readGitText(
      projectPath,
      ["status", "--short", "--branch"],
      "git-status",
      signal,
    ),
    readGitText(
      projectPath,
      ["log", "-1", "--pretty=format:%h%x20%s"],
      "git-log",
      signal,
    ),
  ]);

  return {
    available: true,
    status,
    recentCommit,
  };
}

async function readGitText(
  projectPath: string,
  args: string[],
  operation: "git-status" | "git-log",
  signal?: AbortSignal,
): Promise<string | undefined> {
  signal?.throwIfAborted();
  try {
    const { stdout, exitCode } = await runTextProcess(
      "git",
      ["-C", projectPath, ...args],
      {
        toolName: `doolittle.project-inspection.${operation}`,
        abortSignal: signal,
      },
    );
    signal?.throwIfAborted();
    return exitCode === 0 ? stdout.trim() || undefined : undefined;
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}
