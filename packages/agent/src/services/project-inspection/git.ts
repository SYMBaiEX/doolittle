import { existsSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
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
    const status = (
      await $`git -C ${projectPath} status --short --branch`.quiet().text()
    ).trim();
    return status || undefined;
  } catch {
    return undefined;
  }
}

async function readRecentCommit(
  projectPath: string,
): Promise<string | undefined> {
  try {
    const recentCommit = (
      await $`git -C ${projectPath} log -1 --pretty=format:%h%x20%s`
        .quiet()
        .text()
    ).trim();
    return recentCommit || undefined;
  } catch {
    return undefined;
  }
}
