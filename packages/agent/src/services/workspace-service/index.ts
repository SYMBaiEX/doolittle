import { existsSync, readFileSync } from "node:fs";
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
  applyWorkspacePatch,
  createWorkspaceDirectory,
  planWorkspacePatch,
  readWorkspaceLines,
  searchWorkspaceFiles,
  type WorkspaceDirectoryResult,
  type WorkspaceFileSearchInput,
  type WorkspaceFileSearchResult,
  type WorkspacePatchResult,
  type WorkspaceReadLinesResult,
  type WorkspaceWriteResult,
  writeWorkspaceFile,
} from "./file-operations";
import { resolveWorkspaceServicePath } from "./path";
import { searchWorkspace } from "./search";
import { summarizeWorkspaceTree } from "./summary";
import { listWorkspaceTree } from "./tree";

export type {
  WorkspaceDirectoryResult,
  WorkspaceFileSearchInput,
  WorkspaceFileSearchMatch,
  WorkspaceFileSearchResult,
  WorkspacePatchResult,
  WorkspaceReadLinesResult,
  WorkspaceWriteResult,
} from "./file-operations";

export class WorkspaceService {
  constructor(private readonly workspaceDirectory: WorkspaceDirectorySource) {}

  root(): string {
    return resolveWorkspaceDirectory(this.workspaceDirectory);
  }

  tree(maxDepth = 2): WorkspaceEntry[] {
    return listWorkspaceTree(this.root(), maxDepth);
  }

  read(path: string): string {
    const root = this.root();
    const resolvedPath = resolveWorkspaceServicePath(root, path, "read");
    if (!existsSync(resolvedPath)) {
      throw new Error(`Path not found: ${path}`);
    }
    return readFileSync(resolvedPath, "utf8");
  }

  async write(path: string, content: string): Promise<string> {
    return (await this.writeFile(path, content)).path;
  }

  readLines(
    path: string,
    options: { offset?: number; limit?: number } = {},
  ): WorkspaceReadLinesResult {
    const root = this.root();
    return readWorkspaceLines(root, path, options);
  }

  async writeFile(
    path: string,
    content: string,
  ): Promise<WorkspaceWriteResult> {
    const root = this.root();
    // Validate before creating a checkpoint so rejected paths cannot create
    // unrelated repository history.
    resolveWorkspaceServicePath(root, path, "write");
    await this.checkpointBeforeMutation(
      root,
      `Before workspace write: ${path}`,
    );
    return writeWorkspaceFile(root, path, content);
  }

  createDirectory(path: string): WorkspaceDirectoryResult {
    const root = this.root();
    return createWorkspaceDirectory(root, path);
  }

  async patch(
    path: string,
    oldText: string,
    newText: string,
    options: { replaceAll?: boolean } = {},
  ): Promise<WorkspacePatchResult> {
    const root = this.root();
    const plan = planWorkspacePatch(root, path, oldText, newText, options);
    await this.checkpointBeforeMutation(
      root,
      `Before workspace patch: ${path}`,
    );
    return applyWorkspacePatch(plan);
  }

  searchFiles(input: WorkspaceFileSearchInput): WorkspaceFileSearchResult {
    const root = this.root();
    return searchWorkspaceFiles(root, input);
  }

  async search(
    query: string,
    maxResults = 25,
  ): Promise<Array<{ path: string; matches: string[] }>> {
    const root = this.root();
    return searchWorkspace(root, query, maxResults);
  }

  summary(maxEntries = 20): string {
    const entries = this.tree(2);
    return summarizeWorkspaceTree(entries, maxEntries);
  }

  checkpointSupport(): Promise<WorkspaceCheckpointSupport> {
    return this.checkpointsFor(this.root()).support();
  }

  listCheckpoints(): Promise<WorkspaceCheckpoint[]> {
    return this.checkpointsFor(this.root()).list();
  }

  createCheckpoint(label?: string): Promise<WorkspaceCheckpoint> {
    return this.checkpointsFor(this.root()).create(label);
  }

  restoreCheckpoint(id: string): Promise<WorkspaceCheckpoint> {
    return this.checkpointsFor(this.root()).restore(id);
  }

  private checkpointsFor(root: string): WorkspaceCheckpointService {
    return new WorkspaceCheckpointService(() => root);
  }

  private async checkpointBeforeMutation(
    root: string,
    label: string,
  ): Promise<void> {
    // Git workspaces receive a non-destructive snapshot before an agent write.
    // Unsupported workspaces retain the existing write behavior and expose their
    // unsupported state through the explicit checkpoint operator routes.
    const checkpoints = this.checkpointsFor(root);
    if (!(await checkpoints.support()).supported) return;

    try {
      await checkpoints.create(label);
    } catch (error) {
      throw new Error(
        `Workspace mutation was not performed because its safety checkpoint failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }
}
