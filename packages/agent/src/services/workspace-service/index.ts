import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import type { WorkspaceEntry } from "@/types";
import {
  resolveWorkspaceDirectory,
  type WorkspaceDirectorySource,
} from "../workspace-directory";
import {
  type WorkspaceCheckpoint,
  WorkspaceCheckpointService,
  type WorkspaceCheckpointSupport,
} from "./checkpoints";
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
  private readonly checkpointService: WorkspaceCheckpointService;

  constructor(private readonly workspaceDirectory: WorkspaceDirectorySource) {
    this.checkpointService = new WorkspaceCheckpointService(() => this.root());
  }

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
    // Git workspaces receive a non-destructive snapshot before an agent write.
    // Unsupported workspaces retain the existing write behavior and expose their
    // unsupported state through the explicit checkpoint operator routes.
    if (this.checkpointSupport().supported) {
      this.createCheckpoint(`Before workspace write: ${path}`);
    }
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

  checkpointSupport(): WorkspaceCheckpointSupport {
    return this.checkpointService.support();
  }

  listCheckpoints(): WorkspaceCheckpoint[] {
    return this.checkpointService.list();
  }

  createCheckpoint(label?: string): WorkspaceCheckpoint {
    return this.checkpointService.create(label);
  }

  restoreCheckpoint(id: string): WorkspaceCheckpoint {
    return this.checkpointService.restore(id);
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
