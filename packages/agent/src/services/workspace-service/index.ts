import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { WorkspaceEntry } from "@/types";
import { resolveWorkspacePath, workspaceDirname } from "./path";
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
    const resolvedPath = this.resolvePath(path);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Path not found: ${path}`);
    }
    return readFileSync(resolvedPath, "utf8");
  }

  write(path: string, content: string): string {
    const resolvedPath = this.resolvePath(path);
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

  private resolvePath(path: string): string {
    return resolveWorkspacePath(this.workspaceDir, path);
  }
}
