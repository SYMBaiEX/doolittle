import { ORCHESTRATOR_TASK_SERVICE } from "@doolittle/contracts";
import type { AgentSkillsService } from "@elizaos/plugin-agent-skills";
import type {
  WorkspaceDirectoryResult,
  WorkspaceFileSearchInput,
  WorkspaceFileSearchResult,
  WorkspacePatchResult,
  WorkspaceReadLinesResult,
  WorkspaceWriteResult,
} from "@/services/workspace-service";
import type { SdkTrajectoryLogger } from "@/types/trajectory/sdk";

export const AGENT_SKILLS_SERVICE = "AGENT_SKILLS_SERVICE";
export { ORCHESTRATOR_TASK_SERVICE };

/**
 * Public contract exposed by @elizaos/plugin-agent-skills under
 * `AgentSkillsService.serviceType` (`AGENT_SKILLS_SERVICE`).
 */
export type NativeAgentSkillsService = Pick<
  AgentSkillsService,
  | "getLoadedSkills"
  | "getLoadedSkill"
  | "getManagedSkills"
  | "getWorkspaceSkills"
  | "getBundledSkills"
  | "getCatalog"
  | "getSkillDetails"
  | "search"
  | "install"
  | "uninstall"
  | "syncCatalog"
  | "isInstalled"
  | "setSkillEnabled"
>;

export interface NativeCodingIteration {
  index: number;
  startedAt: number;
  completedAt?: number;
  generatedCode?: string;
  fileOperations: unknown[];
  commandResults: unknown[];
  errors: unknown[];
  feedback: unknown[];
  selfCorrected: boolean;
  summary?: string;
}

export interface NativeHumanFeedback {
  id: string;
  timestamp: number;
  text: string;
  iterationRef?: number;
  type: "correction" | "guidance" | "approval" | "rejection";
}

export type NativeTrajectoryLoggerService = SdkTrajectoryLogger;

export const ACP_SUBPROCESS_SERVICE = "ACP_SUBPROCESS_SERVICE";

export type NativeOrchestratorTaskStatus =
  | "open"
  | "active"
  | "waiting_on_user"
  | "blocked"
  | "validating"
  | "done"
  | "failed"
  | "archived"
  | "interrupted";

export interface NativeOrchestratorTaskSession {
  sessionId: string;
  framework: string;
  label: string;
  workdir: string;
  status: string;
  completionSummary: string | null;
  metadata: Record<string, unknown>;
}

export interface NativeOrchestratorTaskThread {
  id: string;
  title: string;
  kind: string;
  status: NativeOrchestratorTaskStatus;
  priority: "low" | "normal" | "high" | "urgent";
  paused: boolean;
  originalRequest: string;
  summary?: string;
  sessionCount: number;
  activeSessionCount: number;
  latestSessionId: string | null;
  latestWorkdir: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface NativeOrchestratorTaskDetail
  extends NativeOrchestratorTaskThread {
  goal: string;
  parentTaskId: string | null;
  acceptanceCriteria: string[];
  providerPolicy: {
    preferredFramework?: string;
    providerSource?: string;
    model?: string;
  } | null;
  metadata: Record<string, unknown>;
  sessions: NativeOrchestratorTaskSession[];
  messages: Array<{
    senderKind: string;
    content: string;
    createdAt: string;
  }>;
  events: Array<{
    eventType: string;
    summary: string;
    createdAt: string;
  }>;
}

export interface NativeOrchestratorCreateTaskInput {
  title: string;
  goal: string;
  originalRequest?: string;
  kind?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  acceptanceCriteria?: string[];
  parentTaskId?: string;
  providerPolicy?: {
    preferredFramework?: string;
    providerSource?: string;
    model?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Structural contract exposed by
 * @elizaos/plugin-agent-orchestrator@2.0.3-beta.7 under
 * ORCHESTRATOR_TASK_SERVICE. The package does not currently re-export its task
 * service types from the public entrypoint, so Doolittle keeps this narrow
 * adapter contract instead of importing package internals.
 */
export interface NativeAgentOrchestratorService {
  createTask(
    input: NativeOrchestratorCreateTaskInput,
  ): Promise<NativeOrchestratorTaskDetail>;
  listTasks(filter?: {
    status?: string;
    search?: string;
    includeArchived?: boolean;
    limit?: number;
  }): Promise<NativeOrchestratorTaskThread[]>;
  getTask(id: string): Promise<NativeOrchestratorTaskDetail | null>;
  updateTask(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<NativeOrchestratorTaskDetail | null>;
  pauseTask(id: string): Promise<NativeOrchestratorTaskDetail | null>;
  resumeTask(id: string): Promise<NativeOrchestratorTaskDetail | null>;
  archiveTask(id: string): Promise<NativeOrchestratorTaskDetail | null>;
  reopenTask(id: string): Promise<NativeOrchestratorTaskDetail | null>;
  validateTask(
    id: string,
    result: {
      passed: boolean;
      summary?: string;
      evidence?: string;
      verifier?: string;
      humanOverride?: boolean;
    },
  ): Promise<NativeOrchestratorTaskDetail | null>;
  retryTaskTurn(
    id: string,
    input?: {
      instruction?: string;
      mode?: "same-session" | "new-session";
      agent?: { workdir?: string; framework?: string };
    },
  ): Promise<NativeOrchestratorTaskDetail | null>;
  restartTask(
    id: string,
    input?: {
      instruction?: string;
      stopActive?: boolean;
      agent?: { workdir?: string; framework?: string };
    },
  ): Promise<NativeOrchestratorTaskDetail | null>;
  addMessage(
    id: string,
    input: {
      content: string;
      senderKind: "user" | "orchestrator" | "sub_agent" | "system";
      direction?: "stdout" | "stderr" | "stdin" | "keys" | "system";
    },
  ): Promise<boolean>;
  spawnAgentForTask(
    id: string,
    options?: {
      framework?: string;
      workdir?: string;
      task?: string;
    },
  ): Promise<NativeOrchestratorTaskDetail | null>;
  stopTaskAgent(id: string, sessionId: string): Promise<boolean>;
  getStatus(): Promise<{
    taskCount: number;
    activeTaskCount: number;
    pausedTaskCount: number;
    blockedTaskCount: number;
    validatingTaskCount: number;
    sessionCount: number;
    activeSessionCount: number;
    byStatus: Record<NativeOrchestratorTaskStatus, number>;
  }>;
  subscribeTaskChanges?(id: string, listener: () => void): () => void;
}

export interface NativeCodingAgentService {
  workspaceRoot(): string;
  workspaceSummary(limit?: number): string;
  read(path: string): unknown;
  write(path: string, content: string): unknown;
  readLines(
    path: string,
    options?: { offset?: number; limit?: number },
  ): WorkspaceReadLinesResult;
  writeFile(path: string, content: string): Promise<WorkspaceWriteResult>;
  createDirectory(path: string): WorkspaceDirectoryResult;
  patch(
    path: string,
    oldText: string,
    newText: string,
    options?: { replaceAll?: boolean },
  ): Promise<WorkspacePatchResult>;
  searchFiles(input: WorkspaceFileSearchInput): WorkspaceFileSearchResult;
  search(query: string, limit?: number): unknown;
  repoStatus(): Promise<unknown>;
  repoDiff(): Promise<unknown>;
  repoLog(limit?: number): Promise<unknown>;
  run(command: string): Promise<unknown>;
  inspectProject(targetPath?: string): Promise<unknown> | unknown;
  findCodebases(query: string): Promise<
    Array<{
      path: string;
      exactBasenameMatch: boolean;
    }>
  >;
  resolveProjectTarget(inputPath: string):
    | {
        path: string;
        kind: "directory" | "file";
      }
    | undefined;
  tasks?(): unknown[];
  context?(
    taskDescription: string,
    options?: {
      sessionId?: string;
      workingDirectory?: string;
      maxIterations?: number;
      interactionMode?: unknown;
      connectorType?: unknown;
      metadata?: Record<string, string>;
      iterations?: NativeCodingIteration[];
      allFeedback?: NativeHumanFeedback[];
    },
  ): unknown;
}

export interface NativeCodeGenerationService {
  capabilityDescription?: string;
  performResearch?: (...args: unknown[]) => unknown;
  generatePRD?: (...args: unknown[]) => unknown;
  performQA?: (...args: unknown[]) => unknown;
  generateCode?: (...args: unknown[]) => unknown;
  generateCodeInternal?: (...args: unknown[]) => unknown;
  runValidationSuite?: (...args: unknown[]) => unknown;
  generateCodeInChunks?: (...args: unknown[]) => unknown;
  installDependencies?: (...args: unknown[]) => unknown;
}
