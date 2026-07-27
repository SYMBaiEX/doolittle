import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import type { WorkspaceEntry } from "@/types";
import {
  assertWorkspacePathResolvesInside,
  resolveWorkspacePath,
  workspaceDirname,
  workspaceRelativePath,
} from "./path";
import { assertWorkspacePathIsSafe } from "./policy";
import { searchWorkspace } from "./search";
import { summarizeWorkspaceTree } from "./summary";
import { listWorkspaceTree } from "./tree";

export class WorkspaceService {
  constructor(private readonly workspaceDir: string) {}

  root(): string {
    return this.workspaceDir;
  }

  tree(maxDepth = 2): WorkspaceEntry[] {
    return listWorkspaceTree(this.workspaceDir, maxDepth);
  }

  read(path: string): string {
    const resolvedPath = this.resolvePath(path, "read");
    if (!existsSync(resolvedPath)) {
      throw new Error(`Path not found: ${path}`);
    }
    return readFileSync(resolvedPath, "utf8");
  }

  write(path: string, content: string): string {
    const resolvedPath = this.resolvePath(path, "write");
    mkdirSync(workspaceDirname(resolvedPath), { recursive: true });
    writeFileSync(resolvedPath, content, "utf8");
    return resolvedPath;
  }

  search(
    query: string,
    maxResults = 25,
  ): Array<{ path: string; matches: string[] }> {
    return searchWorkspace(this.workspaceDir, query, maxResults);
  }

  summary(maxEntries = 20): string {
    const entries = this.tree(2);
    return summarizeWorkspaceTree(entries, maxEntries);
  }

  private resolvePath(path: string, operation: "read" | "write"): string {
    const resolvedPath = resolveWorkspacePath(this.workspaceDir, path);
    const relativePath = workspaceRelativePath(
      relative(this.workspaceDir, resolvedPath),
    );
    assertWorkspacePathIsSafe(relativePath, operation);
    assertWorkspacePathResolvesInside(this.workspaceDir, resolvedPath);
    return resolvedPath;
  }
}
