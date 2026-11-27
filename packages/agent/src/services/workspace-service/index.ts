import { existsSync, readFileSync } from "node:fs";
import { currentConversationWorkspace } from "../../runtime/workspace-scope";
import type { WorkspaceEntry } from "../../types/index";
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
  captureWorkspaceWriteExpectation,
  createWorkspaceDirectory,
  planWorkspacePatch,
  readWorkspaceFile,
  readWorkspaceLines,
  searchWorkspaceFiles,
  type WorkspaceDirectoryResult,
  type WorkspaceFileReadResult,
  type WorkspaceFileSearchInput,
  type WorkspaceFileSearchResult,
  type WorkspacePatchResult,
  type WorkspaceReadLinesResult,
  type WorkspaceWriteResult,
  writeWorkspaceFile,
} from "./file-operations";
import { resolveWorkspaceServicePath } from "./path";
import { searchWorkspace, type WorkspaceSearchOptions } from "./search";
import { summarizeWorkspaceTree } from "./summary";
import {
  listWorkspaceTree,
  listWorkspaceTreeAsync,
  type WorkspaceTreeSnapshot,
} from "./tree";

export type {
  WorkspaceDirectoryResult,
  WorkspaceFileReadResult,
  WorkspaceFileSearchInput,
  WorkspaceFileSearchMatch,
  WorkspaceFileSearchResult,
  WorkspacePatchResult,
  WorkspaceReadLinesResult,
  WorkspaceWriteResult,
} from "./file-operations";
export { WorkspaceWriteConflictError } from "./file-operations";

export class WorkspaceService {
  constructor(private readonly workspaceDirectory: WorkspaceDirectorySource) {}

  root(): string {
    return resolveWorkspaceDirectory(this.workspaceDirectory);
  }

  tree(maxDepth = 2): WorkspaceEntry[] {
    return listWorkspaceTree(
      this.root(),
      maxDepth,
      undefined,
      Boolean(currentConversationWorkspace()),
    );
  }

  treeAsync(
    maxDepth = 2,
    maxEntries?: number,
    signal?: AbortSignal,
  ): Promise<WorkspaceTreeSnapshot> {
    return listWorkspaceTreeAsync(
      this.root(),
      maxDepth,
      maxEntries,
      signal,
      Boolean(currentConversationWorkspace()),
    );
  }

  read(path: string): string {
    const root = this.root();
    const resolvedPath = resolveWorkspaceServicePath(root, path, "read");
    if (!existsSync(resolvedPath)) {
      throw new Error(`Path not found: ${path}`);
    }
    return readFileSync(resolvedPath, "utf8");
  }

  /** Editor-facing read: capped, lossless, and honest about binary content. */
  readFile(path: string): WorkspaceFileReadResult {
    return readWorkspaceFile(this.root(), path);
  }

  async write(
    path: string,
    content: string,
    options?: { expectedContent?: string },
  ): Promise<string> {
    return (await this.writeFile(path, content, options)).path;
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
    options: { expectedContent?: string } = {},
  ): Promise<WorkspaceWriteResult> {
    const root = this.root();
    // Validate before creating a checkpoint so rejected paths cannot create
    // unrelated repository history.
    const resolvedPath = resolveWorkspaceServicePath(root, path, "write");
    const expected =
      options.expectedContent === undefined
        ? undefined
        : captureWorkspaceWriteExpectation(
            resolvedPath,
            options.expectedContent,
          );
    await this.checkpointBeforeMutation(
      root,
      `Before workspace write: ${path}`,
    );
    return writeWorkspaceFile(root, path, content, expected);
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
    options?: WorkspaceSearchOptions,
  ): Promise<Array<{ path: string; matches: string[] }>> {
    const root = this.root();
    return searchWorkspace(root, query, maxResults, {
      ...options,
      requireCanonicalRoot: Boolean(currentConversationWorkspace()),
    });
  }

  summary(maxEntries = 20): string {
    const entries = listWorkspaceTree(
      this.root(),
      2,
      Math.max(0, Math.trunc(maxEntries) || 0),
      Boolean(currentConversationWorkspace()),
    );
    return summarizeWorkspaceTree(entries, maxEntries);
  }

  async summaryAsync(maxEntries = 20): Promise<string> {
    const snapshot = await this.treeAsync(2, Math.max(1, maxEntries));
    return summarizeWorkspaceTree(snapshot.entries, maxEntries);
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
