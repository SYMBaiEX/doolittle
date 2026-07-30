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

export interface DelegationProjectionLike {
  list(): unknown[];
}

export interface CodingProjectInspection {
  name: string;
  path: string;
  type: string;
  packageName?: string;
  packageManager?: string;
  workspacePatterns: string[];
  scripts: string[];
  keyFolders: string[];
  git: {
    available: boolean;
    status?: string;
    recentCommit?: string;
  };
  topEntries: string[];
  readmePreview?: string;
}

export type InspectLocalProject = (
  projectPath: string,
  options?: {
    topEntriesLimit?: number;
    readmeLines?: number;
  },
) => Promise<CodingProjectInspection>;

export interface LocalCodebaseMatch {
  path: string;
  exactBasenameMatch: boolean;
}

export type FindLocalCodebases = (
  query: string,
  workspaceRoot: string,
) => Promise<LocalCodebaseMatch[]>;

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
  workspaceRoot: string;
  workspace: Pick<
    WorkspaceServiceLike,
    "root" | "summary" | "read" | "write" | "search"
  >;
  repository: Pick<
    RepositoryServiceLike,
    "isRepository" | "status" | "diffStat" | "recentCommits"
  >;
  shell: Pick<TerminalServiceLike, "run">;
  delegation: Pick<DelegationProjectionLike, "list">;
  inspectProject: InspectLocalProject;
  findCodebases: FindLocalCodebases;
}
