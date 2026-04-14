import { readFileSync } from "node:fs";
import { resolveWorkspacePath } from "./path";
import { listWorkspaceTree } from "./tree";

export interface WorkspaceSearchResult {
  path: string;
  matches: string[];
}

export function searchWorkspace(
  workspaceDir: string,
  query: string,
  maxResults: number = 25,
): WorkspaceSearchResult[] {
  const ripgrepResults = searchWorkspaceWithRipgrep(
    workspaceDir,
    query,
    maxResults,
  );
  if (ripgrepResults !== undefined) {
    return ripgrepResults;
  }

  const lowerQuery = query.toLowerCase();
  const results: WorkspaceSearchResult[] = [];

  for (const entry of listWorkspaceTree(workspaceDir, 8)) {
    if (entry.type !== "file") {
      continue;
    }

    const absolutePath = resolveWorkspacePath(workspaceDir, entry.path);
    let content = "";
    try {
      content = readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    const matches = lines
      .filter((line) => line.toLowerCase().includes(lowerQuery))
      .slice(0, 3);

    if (matches.length) {
      results.push({
        path: entry.path,
        matches,
      });
    }

    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}

export function searchWorkspaceWithRipgrep(
  workspaceDir: string,
  query: string,
  maxResults: number,
): WorkspaceSearchResult[] | undefined {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const proc = Bun.spawnSync({
      cmd: [
        "rg",
        "--no-heading",
        "--line-number",
        "--color",
        "never",
        "--hidden",
        "--fixed-strings",
        "--max-count",
        "3",
        "--glob",
        "!.git",
        "--glob",
        "!node_modules",
        "--glob",
        "!.doolittle",
        "--glob",
        "!dist",
        trimmed,
        ".",
      ],
      cwd: workspaceDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    if (proc.exitCode !== 0 && proc.exitCode !== 1) {
      return undefined;
    }

    const stdout = proc.stdout ? Buffer.from(proc.stdout).toString("utf8") : "";
    if (!stdout.trim()) {
      return [];
    }

    const grouped = new Map<string, string[]>();
    for (const line of stdout.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const match = line.match(/^(.+?):\d+:(.*)$/u);
      if (!match) {
        continue;
      }
      const [, path, content] = match;
      const existing = grouped.get(path) ?? [];
      if (existing.length < 3) {
        existing.push(content);
      }
      grouped.set(path, existing);
      if (grouped.size >= maxResults) {
        break;
      }
    }

    return Array.from(grouped.entries()).map(([path, matches]) => ({
      path: path.replaceAll("\\", "/"),
      matches,
    }));
  } catch {
    return undefined;
  }
}
