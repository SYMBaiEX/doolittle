import type {
  ConnectorType,
  InteractionMode,
} from "@elizaos/agent/services/coding-agent-context";

export interface WorkspaceServiceLike {
  read(path: string): string;
  write(path: string, content: string): string | Promise<string>;
  search(
    query: string,
    limit?: number,
  ): {
    path: string;
    matches: string[];
  }[];
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

export interface DelegationServiceLike {
  list(): unknown[];
  create(input: {
    title: string;
    objective: string;
    metadata?: Record<string, string>;
  }): unknown;
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

export interface CodingAgentContextOptions {
  sessionId?: string;
  workingDirectory?: string;
  maxIterations?: number;
  interactionMode?: InteractionMode;
  connectorType?: ConnectorType;
  metadata?: Record<string, string>;
}

export interface CodingAgentPluginOptions {
  workspaceRoot: string;
  workspace: Pick<WorkspaceServiceLike, "read" | "write" | "search">;
  repository: Pick<
    RepositoryServiceLike,
    "isRepository" | "status" | "diffStat" | "recentCommits"
  >;
  shell: Pick<TerminalServiceLike, "run">;
  delegation: Pick<DelegationServiceLike, "list"> & {
    create(
      input: Pick<
        Parameters<DelegationServiceLike["create"]>[0],
        "title" | "objective" | "metadata"
      >,
    ): ReturnType<DelegationServiceLike["create"]>;
  };
  inspectProject: InspectLocalProject;
}
