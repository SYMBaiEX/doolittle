import type { AccountPoolResponse } from "../shared/contracts";
import {
  asArray,
  asRecord,
  asString,
  type UnknownRecord,
  useApiResource,
} from "./lib";
import {
  refreshCodegenResources,
  refreshDelegationResources,
  refreshOrchestrationResources,
} from "./orchestration/orchestration-refresh";
import { projectCodegenSelection } from "./orchestration-codegen-selection";
import { scopeTasksByWorkspace } from "./orchestration-helpers";
import type { RepositoryWorktreesResponse } from "./repository-resource-models";
import {
  type OrchestrationTab,
  orchestrationRequests,
} from "./resource-request-policy";
import { type DesktopPlatform, workspacePathsEqual } from "./workspace-path";

export type DelegationOverview = {
  total?: number;
  pending?: number;
  running?: number;
  completed?: number;
  failed?: number;
  cancelled?: number;
};

export type DelegationOverviewResponse = {
  overview?: { local?: DelegationOverview; native?: DelegationOverview };
};

export type DelegationTaskRecord = {
  id: string;
  title: string;
  objective: string;
  status?: string;
  attempts?: number;
  maxAttempts?: number;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
  group?: string;
  profile?: string;
  priority?: string;
  executionMode?: string;
  orchestrationMode?: string;
  lastOutputPath?: string;
  workerPid?: number;
  notes?: string[];
  parentTaskId?: string;
  workspaceRoot?: string;
  capabilityProfile?: string;
  kind?: string;
  framework?: string;
  accountProviderId?: string;
  accountId?: string;
  accountLabel?: string;
  sessionId?: string;
};

type DelegationTaskResponse = { tasks?: unknown[] };
type DelegationTaskDetailResponse = { task?: DelegationTaskRecord | null };

export type WorkerRecord = {
  id: string;
  title?: string;
  objective?: string;
  status?: string;
  attempts?: number;
  attemptsRemaining?: number;
  startedAt?: string;
  completedAt?: string;
  workerPid?: number;
  stalled?: boolean;
  alive?: boolean;
  executionMode?: string;
  workerMode?: string;
  profile?: string;
  group?: string;
  notesCount?: number;
  lastOutputPath?: string;
  parentTaskId?: string;
  capabilityProfile?: string;
  kind?: string;
  framework?: string;
  accountProviderId?: string;
  accountId?: string;
  accountLabel?: string;
  sessionId?: string;
};

type WorkersResponse = {
  overview?: {
    activeWorkers?: number;
    aliveWorkers?: number;
    stalledWorkers?: number;
    byProfile?: Array<{ profile: string; count: number }>;
  };
  workers?: unknown[];
};

export type PlanRecord = {
  id: string;
  title?: string;
  objective?: string;
  status?: "draft" | "active" | "completed" | string;
  taskId?: string;
  workflowId?: string;
  createdAt?: string;
  updatedAt?: string;
  steps?: string[];
  metadata?: UnknownRecord;
};

type PlansResponse = { control?: UnknownRecord; plans?: unknown[] };

export type RepositoryWorktreeRecord = {
  path: string;
  branch?: string;
  detached?: boolean;
  prunable?: boolean;
};

export function isolatedCodingWorktrees(
  worktrees: readonly RepositoryWorktreeRecord[],
  repositoryRoot: string | undefined,
  platform: DesktopPlatform,
): RepositoryWorktreeRecord[] {
  return worktrees.filter(
    (worktree) =>
      Boolean(worktree.branch?.trim()) &&
      !worktree.detached &&
      (!repositoryRoot?.trim() ||
        !workspacePathsEqual(worktree.path, repositoryRoot, platform)),
  );
}

type CodegenRuntimeResponse = {
  execution?: {
    codeGeneration?: {
      available?: boolean;
      ready?: boolean;
      capability?: string;
      detail?: string;
      methods?: string[];
      source?: string;
    };
  };
};

export type CodegenWorkflowRecord = {
  id: string;
  status?: string;
  title?: string;
  objective?: string;
  kind?: string;
  projectName?: string;
  repositoryName?: string;
  taskId?: string;
  sessionId?: string;
  capabilityProfile?: string;
  framework?: string;
  accountProviderId?: string;
  accountId?: string;
  accountLabel?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  runIds?: string[];
  artifactPaths?: string[];
  artifacts?: unknown[];
  latestRunId?: string;
};

type CodegenWorkflowsResponse = {
  summary?: UnknownRecord;
  workflows?: unknown[];
};

export type CodegenRunRecord = {
  id: string;
  phase?: string;
  kind?: string;
  status?: string;
  projectName?: string;
  workflowId?: string;
  taskId?: string;
  sessionId?: string;
  capabilityProfile?: string;
  framework?: string;
  accountProviderId?: string;
  accountId?: string;
  accountLabel?: string;
  parentRunId?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  artifactPaths?: string[];
  artifacts?: unknown[];
  linkedRunIds?: string[];
  outputPreview?: string;
  input?: UnknownRecord;
  error?: string;
};

type CodegenRunsResponse = { summary?: UnknownRecord; runs?: unknown[] };
type WorkflowDetailResponse = {
  workflow?: CodegenWorkflowRecord;
  runs?: unknown[];
  tree?: unknown[];
};
export type WorkflowBundleResponse = {
  workflow?: CodegenWorkflowRecord;
  runs?: unknown[];
  manifestPath?: string;
  manifest?: UnknownRecord;
};
type RunDetailResponse = { run?: CodegenRunRecord };
export type CodegenCancellationResponse = {
  run?: CodegenRunRecord;
  cancellation?: {
    applied?: boolean;
    alreadyCancelled?: boolean;
    executionTerminationSupported?: boolean;
    note?: string;
  };
};

// Keep the data window aligned with the overview snapshot. The queue still
// mounts only TASK_QUEUE_PAGE_SIZE rows at a time, so this widens search and
// selection coverage without turning the rail into a large DOM surface.
export const ORCHESTRATION_TASK_SUMMARY_LIMIT = 500;

export const orchestrationResourcePaths = {
  overview: "/delegation/overview-snapshot",
  tasks: `/delegation/task-summaries?limit=${ORCHESTRATION_TASK_SUMMARY_LIMIT}`,
  workers: "/delegation/workers?limit=100",
  worktrees: "/repo/worktrees",
  plans: "/plans",
  codegenRuntime: "/runtime/codegen",
  accountPool: "/runtime/account-pool",
  codegenWorkflows: "/codegen/workflows",
  codegenRuns: "/codegen/runs",
  workflow: (id: string) => `/codegen/workflows/${encodeURIComponent(id)}`,
  run: (id: string) => `/codegen/runs/${encodeURIComponent(id)}`,
  task: (id: string) => `/delegation/tasks/${encodeURIComponent(id)}`,
} as const;

export function orchestrationResourceId(id: string): string {
  return encodeURIComponent(id);
}

export type OrchestrationResourceScope =
  | "global"
  | "workspace"
  | "workspace-project";

/**
 * Keep cache identity aligned with the server resource's ownership boundary.
 * Global resources intentionally share a cache slot, while workspace-owned
 * records cannot be reused after switching projects or workspaces.
 */
export function orchestrationResourceDependencies(input: {
  enabled: boolean;
  scope: OrchestrationResourceScope;
  projectScope: string;
  workspacePath?: string;
}): readonly unknown[] {
  if (input.scope === "global") return [input.enabled];
  if (input.scope === "workspace") {
    return [input.enabled, input.workspacePath ?? ""];
  }
  return [input.enabled, input.projectScope, input.workspacePath ?? ""];
}

function identifiedRecords<T extends { id: string }>(value: unknown): T[] {
  return asArray(value).flatMap((entry) => {
    const record = asRecord(entry);
    const id = asString(record.id).trim();
    return id ? [{ ...record, id } as T] : [];
  });
}

function delegationTasks(value: unknown): DelegationTaskRecord[] {
  return identifiedRecords<DelegationTaskRecord>(value).filter(
    (task) =>
      Boolean(asString(task.title).trim()) &&
      Boolean(asString(task.objective).trim()),
  );
}

export function normalizeOrchestrationResources(input: {
  tasks?: unknown[];
  workers?: unknown[];
  worktrees?: unknown[];
  plans?: unknown[];
  workflows?: unknown[];
  runs?: unknown[];
  workflowDetailRuns?: unknown[];
}): {
  tasks: DelegationTaskRecord[];
  workers: WorkerRecord[];
  worktrees: RepositoryWorktreeRecord[];
  plans: PlanRecord[];
  workflows: CodegenWorkflowRecord[];
  runs: CodegenRunRecord[];
  workflowDetailRuns: CodegenRunRecord[];
} {
  return {
    tasks: delegationTasks(input.tasks),
    workers: identifiedRecords<WorkerRecord>(input.workers),
    worktrees: asArray(input.worktrees)
      .map((entry) => asRecord(entry) as RepositoryWorktreeRecord)
      .filter((entry) => Boolean(asString(entry.path)) && !entry.prunable),
    plans: identifiedRecords<PlanRecord>(input.plans),
    workflows: identifiedRecords<CodegenWorkflowRecord>(input.workflows),
    runs: identifiedRecords<CodegenRunRecord>(input.runs),
    workflowDetailRuns: identifiedRecords<CodegenRunRecord>(
      input.workflowDetailRuns,
    ),
  };
}

export function projectOrchestrationCodegenSelection(input: {
  workflows: readonly CodegenWorkflowRecord[];
  globalRuns: readonly CodegenRunRecord[];
  workflowDetailRuns: readonly CodegenRunRecord[];
  selectedWorkflowId: string;
  selectedRunId: string;
  detailWorkflowId: string;
  workflowDetailLoading: boolean;
  detailedRun?: CodegenRunRecord;
}) {
  return projectCodegenSelection(input);
}

export function useOrchestrationResources(input: {
  active: boolean;
  activeTab: OrchestrationTab;
  selectedWorkflowId: string;
  selectedRunId: string;
  selectedTaskId: string;
  projectScope: string;
  workspacePath?: string;
  platform: DesktopPlatform;
}) {
  const requestPolicy = orchestrationRequests({
    active: input.active,
    activeTab: input.activeTab,
    hasSelectedWorkflow: Boolean(input.selectedWorkflowId),
    hasSelectedRun: Boolean(input.selectedRunId),
  });
  const overviewResource = useApiResource<DelegationOverviewResponse>(
    requestPolicy.overview ? orchestrationResourcePaths.overview : null,
    orchestrationResourceDependencies({
      enabled: requestPolicy.overview,
      scope: "global",
      projectScope: input.projectScope,
      workspacePath: input.workspacePath,
    }),
  );
  const tasksResource = useApiResource<DelegationTaskResponse>(
    requestPolicy.tasks ? orchestrationResourcePaths.tasks : null,
    orchestrationResourceDependencies({
      enabled: requestPolicy.tasks,
      scope: "workspace-project",
      projectScope: input.projectScope,
      workspacePath: input.workspacePath,
    }),
  );
  const taskDetailResource = useApiResource<DelegationTaskDetailResponse>(
    requestPolicy.tasks && input.selectedTaskId
      ? orchestrationResourcePaths.task(input.selectedTaskId)
      : null,
    [
      ...orchestrationResourceDependencies({
        enabled: requestPolicy.tasks,
        scope: "workspace-project",
        projectScope: input.projectScope,
        workspacePath: input.workspacePath,
      }),
      input.selectedTaskId,
    ],
  );
  const workersResource = useApiResource<WorkersResponse>(
    requestPolicy.workers ? orchestrationResourcePaths.workers : null,
    orchestrationResourceDependencies({
      enabled: requestPolicy.workers,
      scope: "global",
      projectScope: input.projectScope,
      workspacePath: input.workspacePath,
    }),
  );
  const worktreesResource = useApiResource<RepositoryWorktreesResponse>(
    requestPolicy.worktrees ? orchestrationResourcePaths.worktrees : null,
    orchestrationResourceDependencies({
      enabled: requestPolicy.worktrees,
      scope: "workspace",
      projectScope: input.projectScope,
      workspacePath: input.workspacePath,
    }),
  );
  const plansResource = useApiResource<PlansResponse>(
    requestPolicy.plans ? orchestrationResourcePaths.plans : null,
    [requestPolicy.plans],
  );
  const codegenRuntimeResource = useApiResource<CodegenRuntimeResponse>(
    requestPolicy.codegenRuntime
      ? orchestrationResourcePaths.codegenRuntime
      : null,
    [requestPolicy.codegenRuntime],
  );
  const accountPoolResource = useApiResource<AccountPoolResponse>(
    requestPolicy.accountPool ? orchestrationResourcePaths.accountPool : null,
    [requestPolicy.accountPool],
  );
  const codegenWorkflowsResource = useApiResource<CodegenWorkflowsResponse>(
    requestPolicy.codegenWorkflows
      ? orchestrationResourcePaths.codegenWorkflows
      : null,
    [requestPolicy.codegenWorkflows],
  );
  const codegenRunsResource = useApiResource<CodegenRunsResponse>(
    requestPolicy.codegenRuns ? orchestrationResourcePaths.codegenRuns : null,
    [requestPolicy.codegenRuns],
  );
  const workflowDetailResource = useApiResource<WorkflowDetailResponse>(
    requestPolicy.workflowDetail && input.selectedWorkflowId
      ? orchestrationResourcePaths.workflow(input.selectedWorkflowId)
      : null,
    [requestPolicy.workflowDetail, input.selectedWorkflowId],
  );
  const runDetailResource = useApiResource<RunDetailResponse>(
    requestPolicy.runDetail && input.selectedRunId
      ? orchestrationResourcePaths.run(input.selectedRunId)
      : null,
    [requestPolicy.runDetail, input.selectedRunId],
  );
  const normalized = normalizeOrchestrationResources({
    tasks: tasksResource.data?.tasks,
    workers: workersResource.data?.workers,
    worktrees: worktreesResource.data?.worktrees,
    plans: plansResource.data?.plans,
    workflows: codegenWorkflowsResource.data?.workflows,
    runs: codegenRunsResource.data?.runs,
    workflowDetailRuns: workflowDetailResource.data?.runs,
  });
  const tasks = scopeTasksByWorkspace(normalized.tasks, {
    scope: input.projectScope,
    workspacePath: input.workspacePath,
    platform: input.platform,
  });
  const selectedTaskDetail =
    taskDetailResource.data?.task?.id === input.selectedTaskId
      ? taskDetailResource.data.task
      : undefined;
  const detailWorkflowId = asString(workflowDetailResource.data?.workflow?.id);
  const codegenSelection = projectOrchestrationCodegenSelection({
    workflows: normalized.workflows,
    globalRuns: normalized.runs,
    workflowDetailRuns: normalized.workflowDetailRuns,
    selectedWorkflowId: input.selectedWorkflowId,
    selectedRunId: input.selectedRunId,
    detailWorkflowId,
    workflowDetailLoading: workflowDetailResource.loading,
    detailedRun: runDetailResource.data?.run,
  });
  const refreshDelegation = () =>
    refreshDelegationResources({
      overview: overviewResource,
      taskDetail: taskDetailResource,
      tasks: tasksResource,
      workers: workersResource,
    });
  const refreshCodegen = () =>
    refreshCodegenResources({
      runDetail: runDetailResource,
      runs: codegenRunsResource,
      runtime: codegenRuntimeResource,
      selectedRunId: input.selectedRunId,
      selectedWorkflowId: input.selectedWorkflowId,
      workflowDetail: workflowDetailResource,
      workflows: codegenWorkflowsResource,
    });
  const refreshAll = () => {
    if (!input.active) return;
    refreshOrchestrationResources({
      accountPool: accountPoolResource,
      overview: overviewResource,
      plans: plansResource,
      runDetail: runDetailResource,
      runs: codegenRunsResource,
      runtime: codegenRuntimeResource,
      selectedRunId: input.selectedRunId,
      taskDetail: taskDetailResource,
      selectedWorkflowId: input.selectedWorkflowId,
      tasks: tasksResource,
      workers: workersResource,
      workflowDetail: workflowDetailResource,
      workflows: codegenWorkflowsResource,
      worktrees: worktreesResource,
    });
  };

  return {
    requestPolicy,
    overviewResource,
    tasksResource,
    taskDetailResource,
    workersResource,
    worktreesResource,
    plansResource,
    codegenRuntimeResource,
    accountPoolResource,
    codegenWorkflowsResource,
    codegenRunsResource,
    workflowDetailResource,
    runDetailResource,
    ...normalized,
    tasks,
    selectedTaskDetail,
    codegenSelection,
    refreshAll,
    refreshCodegen,
    refreshDelegation,
  };
}
