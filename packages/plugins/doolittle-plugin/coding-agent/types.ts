import type {
  LocalCodebaseMatch,
  LocalProjectInspection,
  LocalProjectTarget,
  WorkspaceDirectoryResult,
  WorkspaceFileSearchInput,
  WorkspaceFileSearchResult,
  WorkspacePatchResult,
  WorkspaceReadLinesResult,
  WorkspaceWriteResult,
} from "@doolittle/agent/plugin-api";
import type {
  CodingIteration,
  ConnectorType,
  HumanFeedback,
  InteractionMode,
} from "@doolittle/contracts";

export interface WorkspaceServiceLike {
  root(): string;
  summary(limit?: number): string;
  read(path: string): string;
  write(path: string, content: string): string | Promise<string>;
  readLines(
    path: string,
    options?: { offset?: number; limit?: number },
  ): WorkspaceReadLinesResult;
  writeFile(
    path: string,
    content: string,
  ): WorkspaceWriteResult | Promise<WorkspaceWriteResult>;
  createDirectory(path: string): WorkspaceDirectoryResult;
  patch(
    path: string,
    oldText: string,
    newText: string,
    options?: { replaceAll?: boolean },
  ): WorkspacePatchResult | Promise<WorkspacePatchResult>;
  searchFiles(input: WorkspaceFileSearchInput): WorkspaceFileSearchResult;
  search(
    query: string,
    limit?: number,
  ):
    | {
        path: string;
        matches: string[];
      }[]
    | Promise<
        {
          path: string;
          matches: string[];
        }[]
      >;
}

export interface RepositoryServiceLike {
  isRepository?(): boolean;
  status(): Promise<string>;
  diffStat(): Promise<string>;
  recentCommits(limit?: number): Promise<string>;
}

export interface TerminalServiceLike {
  run(
    command: string,
    timeoutMs?: number,
    abortSignal?: AbortSignal,
  ): Promise<unknown> | unknown;
}

export type InspectLocalProject = (
  projectPath: string,
  options?: {
    topEntriesLimit?: number;
    readmeLines?: number;
  },
) => Promise<LocalProjectInspection>;

export type FindLocalCodebases = (
  query: string,
  workspaceRoot: string,
) => Promise<LocalCodebaseMatch[]>;

export type ResolveLocalProjectTarget = (
  inputPath: string,
  workspaceRoot: string,
) => LocalProjectTarget | undefined;

export interface CodingAgentContextOptions {
  sessionId?: string;
  workingDirectory?: string;
  maxIterations?: number;
  interactionMode?: InteractionMode;
  connectorType?: ConnectorType;
  metadata?: Record<string, string>;
  iterations?: CodingIteration[];
  allFeedback?: HumanFeedback[];
}

export interface CodingAgentPluginOptions {
  workspace: Pick<
    WorkspaceServiceLike,
    | "root"
    | "summary"
    | "read"
    | "write"
    | "readLines"
    | "writeFile"
    | "createDirectory"
    | "patch"
    | "searchFiles"
    | "search"
  >;
  repository: Pick<
    RepositoryServiceLike,
    "isRepository" | "status" | "diffStat" | "recentCommits"
  >;
  shell: Pick<TerminalServiceLike, "run">;
  inspectProject: InspectLocalProject;
  findCodebases: FindLocalCodebases;
  resolveProjectTarget: ResolveLocalProjectTarget;
}
