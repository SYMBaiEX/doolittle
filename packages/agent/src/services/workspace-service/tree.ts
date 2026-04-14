import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { WorkspaceEntry } from "@/types";
import { workspaceIgnoredNames } from "./constants";
import { workspaceRelativePath } from "./path";

export function listWorkspaceTree(
  workspaceDir: string,
  maxDepth: number,
): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];
  walkWorkspaceTree(workspaceDir, workspaceDir, 0, maxDepth, entries);
  return entries;
}

function walkWorkspaceTree(
  workspaceDir: string,
  currentDir: string,
  depth: number,
  maxDepth: number,
  entries: WorkspaceEntry[],
): void {
  if (depth > maxDepth) {
    return;
  }

  const dirEntries = readdirSync(currentDir).sort((left, right) =>
    left.localeCompare(right),
  );
  for (const name of dirEntries) {
    if (workspaceIgnoredNames.has(name)) {
      continue;
    }

    const absolutePath = join(currentDir, name);
    const relativePath = workspaceRelativePath(
      relative(workspaceDir, absolutePath),
    );
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      entries.push({
        path: relativePath,
        type: "directory",
        depth,
      });
      walkWorkspaceTree(
        workspaceDir,
        absolutePath,
        depth + 1,
        maxDepth,
        entries,
      );
      continue;
    }

    entries.push({
      path: relativePath,
      type: "file",
      depth,
    });
  }
}
