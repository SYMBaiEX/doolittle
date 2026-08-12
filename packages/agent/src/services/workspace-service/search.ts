import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { runTextProcess } from "@/services/process-execution";
import type { WorkspaceEntry } from "@/types";
import { resolveWorkspacePath } from "./path";
import { listWorkspaceTree, listWorkspaceTreeAsync } from "./tree";

export interface WorkspaceSearchResult {
  path: string;
  matches: string[];
}

export async function searchWorkspace(
  workspaceDir: string,
  query: string,
  maxResults: number = 25,
): Promise<WorkspaceSearchResult[]> {
  if (maxResults <= 0) {
    return [];
  }

  const files = (await listWorkspaceTreeAsync(workspaceDir, 8)).entries
    .filter((entry) => entry.type === "file")
    .map((entry) => entry.path);
  const ripgrepResults = await searchWorkspaceWithRipgrepFiles(
    workspaceDir,
    query,
    maxResults,
    files,
  );
  if (ripgrepResults !== undefined) {
    return ripgrepResults;
  }

  return searchWorkspaceWithoutRipgrepAsync(
    workspaceDir,
    query,
    maxResults,
    files,
  );
}

export function searchWorkspaceWithoutRipgrep(
  workspaceDir: string,
  query: string,
  maxResults: number = 25,
): WorkspaceSearchResult[] {
  const lowerQuery = query.trim().toLowerCase();
  if (!lowerQuery || maxResults <= 0) {
    return [];
  }

  const results: WorkspaceSearchResult[] = [];

  for (const entry of searchableWorkspaceFiles(workspaceDir)) {
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

export async function searchWorkspaceWithRipgrep(
  workspaceDir: string,
  query: string,
  maxResults: number,
): Promise<WorkspaceSearchResult[] | undefined> {
  return searchWorkspaceWithRipgrepFiles(
    workspaceDir,
    query,
    maxResults,
    searchableWorkspaceFiles(workspaceDir).map((entry) => entry.path),
  );
}

async function searchWorkspaceWithRipgrepFiles(
  workspaceDir: string,
  query: string,
  maxResults: number,
  files: string[],
): Promise<WorkspaceSearchResult[] | undefined> {
  const trimmed = query.trim();
  if (!trimmed || maxResults <= 0) {
    return [];
  }

  if (!files.length) {
    return [];
  }

  try {
    const grouped = new Map<string, string[]>();

    for (const batch of batchSearchPaths(files)) {
      const result = await runTextProcess(
        "rg",
        [
          "--no-heading",
          "--with-filename",
          "--line-number",
          "--color",
          "never",
          "--no-ignore",
          "--fixed-strings",
          "--max-count",
          "3",
          trimmed,
          "--",
          ...batch,
        ],
        {
          cwd: workspaceDir,
          timeoutMs: 15_000,
          toolName: "doolittle.workspace.search",
        },
      );

      if (result.exitCode !== 0 && result.exitCode !== 1) {
        return undefined;
      }

      const stdout = result.stdout;
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const match = line.match(/^(.+?):\d+:(.*)$/u);
        if (!match) {
          continue;
        }
        const [, path, content] = match;
        const normalizedPath = path.replaceAll("\\", "/");
        const existing = grouped.get(normalizedPath) ?? [];
        if (existing.length < 3) {
          existing.push(content);
        }
        grouped.set(normalizedPath, existing);
        if (grouped.size >= maxResults) {
          break;
        }
      }

      if (grouped.size >= maxResults) {
        break;
      }
    }

    return Array.from(grouped.entries()).map(([path, matches]) => ({
      path,
      matches,
    }));
  } catch {
    return undefined;
  }
}

async function searchWorkspaceWithoutRipgrepAsync(
  workspaceDir: string,
  query: string,
  maxResults: number,
  files: string[],
): Promise<WorkspaceSearchResult[]> {
  const lowerQuery = query.trim().toLowerCase();
  if (!lowerQuery || maxResults <= 0) return [];

  const results: WorkspaceSearchResult[] = [];
  for (const path of files) {
    let content = "";
    try {
      content = await readFile(
        resolveWorkspacePath(workspaceDir, path),
        "utf8",
      );
    } catch {
      continue;
    }

    const matches = content
      .split("\n")
      .filter((line) => line.toLowerCase().includes(lowerQuery))
      .slice(0, 3);
    if (matches.length) results.push({ path, matches });
    if (results.length >= maxResults) break;
  }
  return results;
}

function searchableWorkspaceFiles(workspaceDir: string): WorkspaceEntry[] {
  return listWorkspaceTree(workspaceDir, 8).filter(
    (entry) => entry.type === "file",
  );
}

function batchSearchPaths(paths: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let batchLength = 0;

  for (const path of paths) {
    if (batch.length >= 256 || batchLength + path.length > 24_000) {
      batches.push(batch);
      batch = [];
      batchLength = 0;
    }
    batch.push(path);
    batchLength += path.length + 1;
  }

  if (batch.length) {
    batches.push(batch);
  }
  return batches;
}
