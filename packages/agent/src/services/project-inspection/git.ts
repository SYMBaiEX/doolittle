import { existsSync } from "node:fs";
import { join } from "node:path";
import { runTextProcess } from "@/services/process-execution";
import type { LocalProjectInspection } from "./types";

export async function inspectGitState(
  projectPath: string,
): Promise<LocalProjectInspection["git"]> {
  const gitDirectory = join(projectPath, ".git");
  if (!existsSync(gitDirectory)) {
    return { available: false };
  }

  const [status, recentCommit] = await Promise.all([
    readGitStatus(projectPath),
    readRecentCommit(projectPath),
  ]);

  return {
    available: true,
    status,
    recentCommit,
  };
}

async function readGitStatus(projectPath: string): Promise<string | undefined> {
  try {
    const { stdout, exitCode } = await runTextProcess(
      "git",
      ["-C", projectPath, "status", "--short", "--branch"],
      { toolName: "doolittle.project-inspection.git-status" },
    );
    if (exitCode !== 0) return undefined;
    const status = stdout.trim();
    return status || undefined;
  } catch {
    return undefined;
  }
}

async function readRecentCommit(
  projectPath: string,
): Promise<string | undefined> {
  try {
    const { stdout, exitCode } = await runTextProcess(
      "git",
      ["-C", projectPath, "log", "-1", "--pretty=format:%h%x20%s"],
      { toolName: "doolittle.project-inspection.git-log" },
    );
    if (exitCode !== 0) return undefined;
    const recentCommit = stdout.trim();
    return recentCommit || undefined;
  } catch {
    return undefined;
  }
}
