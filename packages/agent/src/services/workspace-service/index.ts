import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import type { WorkspaceEntry } from "@/types";
import {
  resolveWorkspaceDirectory,
  type WorkspaceDirectorySource,
} from "../workspace-directory";
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
  constructor(private readonly workspaceDirectory: WorkspaceDirectorySource) {}

  root(): string {
    return resolveWorkspaceDirectory(this.workspaceDirectory);
  }

  tree(maxDepth = 2): WorkspaceEntry[] {
    return listWorkspaceTree(this.root(), maxDepth);
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
    return searchWorkspace(this.root(), query, maxResults);
  }

  summary(maxEntries = 20): string {
    const entries = this.tree(2);
    return summarizeWorkspaceTree(entries, maxEntries);
  }

  private resolvePath(path: string, operation: "read" | "write"): string {
    const workspaceDir = this.root();
    const resolvedPath = resolveWorkspacePath(workspaceDir, path);
    const relativePath = workspaceRelativePath(
      relative(workspaceDir, resolvedPath),
    );
    assertWorkspacePathIsSafe(relativePath, operation);
    assertWorkspacePathResolvesInside(workspaceDir, resolvedPath);
    return resolvedPath;
  }
}
