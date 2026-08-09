import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AccountPoolResponse } from "../shared/contracts";
import type { ChatContextRequest } from "./chat-context-handoff";
import { ArtifactViewer } from "./components/ArtifactViewer";
import type { DesktopNavigationIntent } from "./desktop-navigation-intent";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  type UnknownRecord,
  useApiResource,
} from "./lib";
import { projectCodegenSelection } from "./orchestration-codegen-selection";
import {
  orchestrationStatusTier,
  orchestrationTimingLabel,
  scopeTasksByWorkspace,
  type TaskCapability,
  taskCapabilityLabel,
  taskCreatePayload,
  taskExecutionLabel,
  taskSpawnPayload,
} from "./orchestration-helpers";
import { ReviewPage } from "./ReviewPage";
import { orchestrationRequests } from "./resource-request-policy";
import "./orchestration.css";

export type WorkTabId = "tasks" | "agents" | "plans" | "runs" | "review";
type NoticeKind = "neutral" | "good" | "warn" | "bad";
type TaskAction =
  | "execute"
  | "run"
  | "retry"
  | "cancel"
  | "complete"
  | "fail"
  | "note";
type CodegenMode = "generate" | "research" | "prd" | "qa";

type DelegationOverview = {
  total?: number;
  pending?: number;
  running?: number;
  completed?: number;
  failed?: number;
  cancelled?: number;
};

type DelegationOverviewResponse = {
  overview?: {
    local?: DelegationOverview;
    native?: DelegationOverview;
  };
};

type DelegationTaskRecord = {
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

type DelegationTaskResponse = {
  tasks?: unknown[];
};

type WorkerRecord = {
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

type PlanRecord = {
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

type PlansResponse = {
  control?: UnknownRecord;
  plans?: unknown[];
};

type RepositoryWorktreeRecord = {
  path: string;
  branch?: string;
  detached?: boolean;
  prunable?: boolean;
};

type RepositoryWorktreesResponse = {
  worktrees?: unknown[];
};

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

type CodegenWorkflowRecord = {
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

type CodegenRunRecord = {
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

type CodegenRunsResponse = {
  summary?: UnknownRecord;
  runs?: unknown[];
};

type WorkflowDetailResponse = {
  workflow?: CodegenWorkflowRecord;
  runs?: unknown[];
  tree?: unknown[];
};

type WorkflowBundleResponse = {
  workflow?: CodegenWorkflowRecord;
  runs?: unknown[];
  manifestPath?: string;
  manifest?: UnknownRecord;
};

type RunDetailResponse = {
  run?: CodegenRunRecord;
};

type CodegenCancellationResponse = {
  run?: CodegenRunRecord;
  cancellation?: {
    applied?: boolean;
    alreadyCancelled?: boolean;
    executionTerminationSupported?: boolean;
    note?: string;
  };
};

type SurfaceNotice = {
  id: number;
  tone: NoticeKind;
  message: string;
  details?: string;
};

type ConfirmedAction = {
  taskId: string;
  action: "cancel" | "fail";
};

export const WORK_TABS: ReadonlyArray<{ id: WorkTabId; label: string }> = [
  { id: "tasks", label: "Queue" },
  { id: "agents", label: "Agents" },
  { id: "plans", label: "Plans" },
  { id: "runs", label: "Build & research" },
  { id: "review", label: "Review" },
];

function runArtifacts(record: CodegenRunRecord): unknown[] {
  const opaque = asArray(record.artifacts);
  return opaque.length > 0 ? opaque : asArray(record.artifactPaths);
}

const CODEGEN_MODES: Array<{
  id: CodegenMode;
  label: string;
  detail: string;
}> = [
  { id: "generate", label: "Generate", detail: "Build from a prompt" },
  { id: "research", label: "Research", detail: "Investigate an approach" },
  { id: "prd", label: "PRD", detail: "Research and specify" },
  { id: "qa", label: "QA", detail: "Run project quality checks" },
];

function normalizeText(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function compactPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 4 ? `…/${parts.slice(-4).join("/")}` : value;
}

function statusTone(status: string): "good" | "warn" | "bad" | "neutral" {
  const normalized = status.toLowerCase();
  if (["completed", "done", "success"].includes(normalized)) return "good";
  if (["failed", "cancelled", "error", "stalled"].includes(normalized))
    return "bad";
  if (["running", "queued", "pending", "active"].includes(normalized))
    return "warn";
  return "neutral";
}

function compactStatus(status?: string): string {
  return status ? status.replaceAll("-", " ") : "pending";
}

function compactControlValue(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) return `${value.length}`;
  if (value && typeof value === "object") return "available";
  return "none";
}

function compactDetailValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value && typeof value === "object") {
    return normalizeText(JSON.stringify(value), 180);
  }
  return "—";
}

function safeResourceId(id: string): string {
  return encodeURIComponent(id);
}

async function postJson<T>(path: string, body: UnknownRecord): Promise<T> {
  return desktopRequest<T>(
    path as Parameters<typeof desktopRequest<T>>[0],
    "POST",
    body,
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | undefined;
}) {
  return (
    <div className="orchestration-detail-row">
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

function SmallEmpty({ children }: { children: string }) {
  return <p className="orchestration-empty-line">{children}</p>;
}

function SummaryChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <span className={`orchestration-summary-chip ${tone}`}>
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  );
}

function DetailTag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return <span className={`orchestration-detail-tag ${tone}`}>{children}</span>;
}

export function OrchestrationPage({
  active,
  navigationIntent,
  onAcknowledgeNavigationIntent,
  onSectionChange,
  onSendToChat,
  projectScope = "all",
  reviewMode = false,
  workspaceLabel,
  workspacePath,
}: {
  active: boolean;
  navigationIntent: DesktopNavigationIntent | null;
  onAcknowledgeNavigationIntent: (id: string) => void;
  onSectionChange?: (section: WorkTabId) => void;
  onSendToChat: (request: ChatContextRequest) => void;
  projectScope?: string;
  reviewMode?: boolean;
  workspaceLabel?: string;
  workspacePath?: string;
}) {
  const [activeTab, setActiveTab] = useState<WorkTabId>(
    reviewMode ? "review" : "tasks",
  );
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [bundleWorkflowId, setBundleWorkflowId] = useState("");
  const [bundleResult, setBundleResult] =
    useState<WorkflowBundleResponse | null>(null);
  const [bundleError, setBundleError] = useState("");
  const [bundleLoading, setBundleLoading] = useState(false);
  const [confirmedRunCancellation, setConfirmedRunCancellation] = useState("");
  const tabRefs = useRef<Record<WorkTabId, HTMLButtonElement | null>>({
    tasks: null,
    agents: null,
    plans: null,
    runs: null,
    review: null,
  });
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const confirmReturnRef = useRef<HTMLButtonElement | null>(null);
  const consumedNavigationIntents = useRef(new Set<string>());

  useEffect(() => {
    if (reviewMode) {
      setActiveTab("review");
    } else {
      setActiveTab((current) => (current === "review" ? "tasks" : current));
    }
  }, [reviewMode]);

  const requestPolicy = orchestrationRequests({
    active,
    activeTab,
    hasSelectedWorkflow: Boolean(selectedWorkflowId),
    hasSelectedRun: Boolean(selectedRunId),
  });

  const overviewResource = useApiResource<DelegationOverviewResponse>(
    requestPolicy.overview ? "/delegation/overview" : null,
    [requestPolicy.overview],
  );
  const tasksResource = useApiResource<DelegationTaskResponse>(
    requestPolicy.tasks ? "/delegation/tasks?limit=100" : null,
    [requestPolicy.tasks],
  );
  const workersResource = useApiResource<WorkersResponse>(
    requestPolicy.workers ? "/delegation/workers?limit=100" : null,
    [requestPolicy.workers],
  );
  const worktreesResource = useApiResource<RepositoryWorktreesResponse>(
    requestPolicy.worktrees ? "/repo/worktrees" : null,
    [requestPolicy.worktrees],
  );
  const plansResource = useApiResource<PlansResponse>(
    requestPolicy.plans ? "/plans" : null,
    [requestPolicy.plans],
  );
  const codegenRuntimeResource = useApiResource<CodegenRuntimeResponse>(
    requestPolicy.codegenRuntime ? "/runtime/codegen" : null,
    [requestPolicy.codegenRuntime],
  );
  const accountPoolResource = useApiResource<AccountPoolResponse>(
    requestPolicy.accountPool ? "/runtime/account-pool" : null,
    [requestPolicy.accountPool],
  );
  const codegenWorkflowsResource = useApiResource<CodegenWorkflowsResponse>(
    requestPolicy.codegenWorkflows ? "/codegen/workflows" : null,
    [requestPolicy.codegenWorkflows],
  );
  const codegenRunsResource = useApiResource<CodegenRunsResponse>(
    requestPolicy.codegenRuns ? "/codegen/runs" : null,
    [requestPolicy.codegenRuns],
  );
  const workflowDetailResource = useApiResource<WorkflowDetailResponse>(
    requestPolicy.workflowDetail && selectedWorkflowId
      ? `/codegen/workflows/${safeResourceId(selectedWorkflowId)}`
      : null,
    [requestPolicy.workflowDetail, selectedWorkflowId],
  );
  const runDetailResource = useApiResource<RunDetailResponse>(
    requestPolicy.runDetail && selectedRunId
      ? `/codegen/runs/${safeResourceId(selectedRunId)}`
      : null,
    [requestPolicy.runDetail, selectedRunId],
  );

  const allTasks = asArray(tasksResource.data?.tasks).map((entry) =>
    asRecord(entry),
  ) as DelegationTaskRecord[];
  const tasks = scopeTasksByWorkspace(allTasks, {
    scope: projectScope,
    workspacePath,
    platform: window.doolittle.platform,
  });
  const workers = asArray(workersResource.data?.workers).map((entry) =>
    asRecord(entry),
  ) as WorkerRecord[];
  const worktrees = asArray(worktreesResource.data?.worktrees)
    .map((entry) => asRecord(entry) as RepositoryWorktreeRecord)
    .filter((entry) => Boolean(asString(entry.path)) && !entry.prunable);
  const plans = asArray(plansResource.data?.plans).map((entry) =>
    asRecord(entry),
  ) as PlanRecord[];
  const workflows = asArray(codegenWorkflowsResource.data?.workflows).map(
    (entry) => asRecord(entry),
  ) as CodegenWorkflowRecord[];
  const runs = asArray(codegenRunsResource.data?.runs).map((entry) =>
    asRecord(entry),
  ) as CodegenRunRecord[];
  const detailWorkflowId = asString(workflowDetailResource.data?.workflow?.id);
  const workflowDetailRuns = asArray(workflowDetailResource.data?.runs).map(
    (entry) => asRecord(entry),
  ) as CodegenRunRecord[];

  const selectedTask =
    tasks.find((entry) => asString(entry.id) === selectedTaskId) ?? tasks[0];
  const selectedWorker =
    workers.find((entry) => asString(entry.id) === selectedWorkerId) ??
    workers[0];
  const selectedPlan =
    plans.find((entry) => asString(entry.id) === selectedPlanId) ?? plans[0];
  const detailedRun = runDetailResource.data?.run;
  const codegenSelection = projectCodegenSelection({
    workflows,
    globalRuns: runs,
    workflowDetailRuns,
    selectedWorkflowId,
    selectedRunId,
    detailWorkflowId,
    workflowDetailLoading: workflowDetailResource.loading,
    detailedRun,
  });
  const { selectedWorkflow, selectedRun, visibleRuns } = codegenSelection;

  const [showTaskCreate, setShowTaskCreate] = useState(false);
  const [showPlanCreate, setShowPlanCreate] = useState(false);
  const [showChildCreate, setShowChildCreate] = useState(false);
  const [taskCreateTitle, setTaskCreateTitle] = useState("");
  const [taskCreateObjective, setTaskCreateObjective] = useState("");
  const [taskCreateCapability, setTaskCreateCapability] =
    useState<TaskCapability>("coding");
  const [taskCreateFramework, setTaskCreateFramework] = useState("");
  const [taskCreateGroup, setTaskCreateGroup] = useState("");
  const [taskCreatePriority, setTaskCreatePriority] = useState<
    "low" | "normal" | "high" | ""
  >("");
  const [taskCreateWorkspaceRoot, setTaskCreateWorkspaceRoot] = useState("");
  const [childTitle, setChildTitle] = useState("");
  const [childObjective, setChildObjective] = useState("");
  const [childWorkspaceRoot, setChildWorkspaceRoot] = useState("");
  const [superviseConcurrency, setSuperviseConcurrency] = useState("3");
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
  const [cascadeChildren, setCascadeChildren] = useState(true);
  const [confirmedAction, setConfirmedAction] =
    useState<ConfirmedAction | null>(null);

  const [planTitle, setPlanTitle] = useState("");
  const [planObjective, setPlanObjective] = useState("");
  const [planStatus, setPlanStatus] = useState<
    "draft" | "active" | "completed"
  >("draft");
  const [planTaskId, setPlanTaskId] = useState("");
  const [planWorkflowId, setPlanWorkflowId] = useState("");
  const [planSteerInstruction, setPlanSteerInstruction] = useState("");

  const [codegenMode, setCodegenMode] = useState<CodegenMode>("generate");
  const [codegenProjectName, setCodegenProjectName] = useState("");
  const [codegenPrompt, setCodegenPrompt] = useState("");
  const [codegenProjectPath, setCodegenProjectPath] = useState("");
  const [codegenTargetType, setCodegenTargetType] = useState("plugin");

  const [busyKeys, setBusyKeys] = useState<Record<string, boolean>>({});
  const [notices, setNotices] = useState<SurfaceNotice[]>([]);

  useEffect(() => {
    if (!workspacePath?.trim()) return;
    setTaskCreateWorkspaceRoot((current) => current || workspacePath);
    setCodegenProjectPath((current) => current || workspacePath);
    setCodegenProjectName(
      (current) => current || workspaceLabel || "workspace",
    );
  }, [workspaceLabel, workspacePath]);

  useEffect(() => {
    if (navigationIntent?.kind !== "orchestration-task" || !active) return;
    if (consumedNavigationIntents.current.has(navigationIntent.id)) {
      onAcknowledgeNavigationIntent(navigationIntent.id);
      return;
    }
    const taskId = navigationIntent.target.taskId.trim();
    if (!taskId || tasksResource.loading) return;
    if (!tasks.some((task) => task.id === taskId)) {
      consumedNavigationIntents.current.add(navigationIntent.id);
      setNotices((current) => [
        {
          id: Date.now(),
          tone: "warn",
          message:
            "That task is no longer available in the selected workspace.",
        },
        ...current,
      ]);
      onAcknowledgeNavigationIntent(navigationIntent.id);
      return;
    }
    consumedNavigationIntents.current.add(navigationIntent.id);
    setActiveTab("tasks");
    setSelectedTaskId(taskId);
    onAcknowledgeNavigationIntent(navigationIntent.id);
  }, [
    active,
    navigationIntent,
    onAcknowledgeNavigationIntent,
    tasks,
    tasksResource.loading,
  ]);

  useEffect(() => {
    if (tasks.length > 0 && !tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(tasks[0]?.id ?? "");
    }
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    if (
      workers.length > 0 &&
      !workers.some((worker) => worker.id === selectedWorkerId)
    ) {
      setSelectedWorkerId(workers[0]?.id ?? "");
    }
  }, [selectedWorkerId, workers]);

  useEffect(() => {
    if (plans.length > 0 && !plans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(plans[0]?.id ?? "");
    }
  }, [plans, selectedPlanId]);

  useEffect(() => {
    if (codegenSelection.selectedWorkflowIdUpdate !== undefined) {
      setSelectedWorkflowId(codegenSelection.selectedWorkflowIdUpdate);
    }
  }, [codegenSelection.selectedWorkflowIdUpdate]);

  useEffect(() => {
    if (codegenSelection.selectedRunIdUpdate !== undefined) {
      setSelectedRunId(codegenSelection.selectedRunIdUpdate);
    }
  }, [codegenSelection.selectedRunIdUpdate]);

  useEffect(() => {
    if (
      confirmedRunCancellation &&
      confirmedRunCancellation !== selectedRun?.id
    ) {
      setConfirmedRunCancellation("");
    }
  }, [confirmedRunCancellation, selectedRun?.id]);

  const overview = asRecord(overviewResource.data?.overview);
  const nativeOverview = asRecord(overview.native);
  const localOverview = asRecord(overview.local);
  const globalOverview =
    Object.keys(nativeOverview).length > 0 ? nativeOverview : localOverview;
  const scopedOverview =
    projectScope === "all"
      ? globalOverview
      : tasks.reduce(
          (summary, task) => {
            const tier = orchestrationStatusTier(task.status);
            summary.total += 1;
            if (tier === "running") summary.running += 1;
            if (tier === "queued" || tier === "approval") summary.pending += 1;
            if (tier === "completed") summary.completed += 1;
            if (tier === "failed") summary.failed += 1;
            return summary;
          },
          { total: 0, running: 0, pending: 0, completed: 0, failed: 0 },
        );
  const effectiveOverview = scopedOverview;
  const workerOverview = asRecord(workersResource.data?.overview);
  const codegenExecution = asRecord(
    codegenRuntimeResource.data?.execution?.codeGeneration,
  );
  const codegenAvailable = Boolean(codegenExecution.available ?? false);
  const codegenReady = Boolean(codegenExecution.ready ?? false);
  const poolProviders = accountPoolResource.data?.providers;
  const recommendedPooledFramework = poolProviders?.[
    "openai-codex"
  ]?.accounts.some((account) => account.enabled)
    ? "codex"
    : poolProviders?.["anthropic-subscription"]?.accounts.some(
          (account) => account.enabled,
        )
      ? "claude"
      : "";
  const workflowSummary = asRecord(codegenWorkflowsResource.data?.summary);
  const planningControl = asRecord(plansResource.data?.control);
  const supportsPlanCreate = Boolean(planningControl.supportsCreate);
  const selectedTaskNote = selectedTask
    ? (taskNotes[selectedTask.id] ?? "")
    : "";
  const linkedPlanTask = selectedPlan?.taskId
    ? tasks.find((task) => task.id === selectedPlan.taskId)
    : undefined;
  const planCanSteer =
    asString(selectedPlan?.status) === "active" &&
    Boolean(linkedPlanTask) &&
    asString(linkedPlanTask?.status) === "pending";

  const planMetaLines = useMemo(() => {
    return Object.entries(planningControl).map(
      ([key, value]) => `${key}: ${compactControlValue(value)}`,
    );
  }, [planningControl]);

  const approvalCount = plans.filter(
    (plan) =>
      orchestrationStatusTier(asString(plan.status, "draft")) === "approval",
  ).length;
  const completedCount = tasks.filter(
    (task) =>
      orchestrationStatusTier(asString(task.status, "pending")) === "completed",
  ).length;
  const workerActiveCount = workers.filter(
    (worker) =>
      orchestrationStatusTier(asString(worker.status, "idle")) === "running",
  ).length;

  const publishNotice = ({
    tone,
    message,
    details,
  }: {
    tone: NoticeKind;
    message: string;
    details?: string;
  }) => {
    setNotices((current) => [
      ...current.slice(-2),
      { id: Date.now(), tone, message, details },
    ]);
  };

  const runBusy = (key: string, next: boolean) => {
    setBusyKeys((current) => {
      if (next) return { ...current, [key]: true };
      const nextState = { ...current };
      delete nextState[key];
      return nextState;
    });
  };

  const refreshDelegation = () => {
    tasksResource.reload();
    workersResource.reload();
    overviewResource.reload();
  };

  const refreshCodegen = () => {
    codegenRuntimeResource.reload();
    codegenWorkflowsResource.reload();
    codegenRunsResource.reload();
    if (selectedWorkflowId) workflowDetailResource.reload();
    if (selectedRunId) runDetailResource.reload();
  };

  const refreshAll = () => {
    if (!active) return;
    refreshDelegation();
    worktreesResource.reload();
    plansResource.reload();
    accountPoolResource.reload();
    refreshCodegen();
  };

  const onSubmitCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskCreateTitle.trim() || !taskCreateObjective.trim()) {
      publishNotice({
        tone: "bad",
        message: "Title and objective are required.",
      });
      return;
    }
    const key = "task:create";
    runBusy(key, true);
    try {
      const result = await postJson<{ task?: DelegationTaskRecord }>(
        "/delegation/tasks",
        taskCreatePayload({
          title: taskCreateTitle,
          objective: taskCreateObjective,
          capability: taskCreateCapability,
          framework: taskCreateFramework,
          group: taskCreateGroup,
          priority: taskCreatePriority,
          workspaceRoot: taskCreateWorkspaceRoot,
        }),
      );
      const nextId = asString(result.task?.id);
      if (nextId) setSelectedTaskId(nextId);
      setTaskCreateTitle("");
      setTaskCreateObjective("");
      setTaskCreateFramework("");
      setTaskCreateGroup("");
      setTaskCreatePriority("");
      setTaskCreateWorkspaceRoot("");
      setShowTaskCreate(false);
      publishNotice({ tone: "good", message: "Task created." });
      refreshDelegation();
    } catch (error) {
      publishNotice({
        tone: "bad",
        message: "Task creation failed.",
        details: errorMessage(error),
      });
    } finally {
      runBusy(key, false);
    }
  };

  const onSubmitSpawn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active || !selectedTask || !childObjective.trim()) return;
    const key = `task:${selectedTask.id}:spawn`;
    runBusy(key, true);
    try {
      const result = await postJson<{ task?: DelegationTaskRecord }>(
        `/delegation/tasks/${safeResourceId(selectedTask.id)}/spawn`,
        taskSpawnPayload({
          title: childTitle || "Child task",
          objective: childObjective,
          group: selectedTask.group,
          profile: selectedTask.profile,
          capabilityProfile: selectedTask.capabilityProfile,
          kind: selectedTask.kind,
          framework: selectedTask.framework,
          executionMode: selectedTask.executionMode,
          workspaceRoot: childWorkspaceRoot,
        }),
      );
      setChildTitle("");
      setChildObjective("");
      setChildWorkspaceRoot("");
      setShowChildCreate(false);
      const childId = asString(result.task?.id);
      if (childId) setSelectedTaskId(childId);
      publishNotice({ tone: "good", message: "Child task spawned." });
      refreshDelegation();
    } catch (error) {
      publishNotice({
        tone: "bad",
        message: "Child task could not be spawned.",
        details: errorMessage(error),
      });
    } finally {
      runBusy(key, false);
    }
  };

  const runTaskAction = async (
    task: DelegationTaskRecord,
    action: TaskAction,
  ) => {
    if (!active) return;
    const key = `task:${task.id}:${action}`;
    const note = taskNotes[task.id]?.trim() ?? "";
    if (action === "note" && !note) {
      publishNotice({ tone: "bad", message: "Write a note before adding it." });
      return;
    }
    runBusy(key, true);
    try {
      await postJson<UnknownRecord>(
        `/delegation/tasks/${safeResourceId(task.id)}/${action}`,
        {
          note: note || undefined,
          cascadeChildren:
            action === "cancel" || action === "fail"
              ? cascadeChildren
              : undefined,
        },
      );
      if (action === "note") {
        setTaskNotes((current) => ({ ...current, [task.id]: "" }));
      }
      const restoreConfirmationFocus =
        confirmedAction?.taskId === task.id &&
        (action === "cancel" || action === "fail");
      setConfirmedAction(null);
      if (restoreConfirmationFocus) {
        requestAnimationFrame(() => confirmReturnRef.current?.focus());
      }
      publishNotice({
        tone: "good",
        message: `${compactStatus(action)} accepted for ${task.title}.`,
      });
      refreshDelegation();
    } catch (error) {
      publishNotice({
        tone: "bad",
        message: `${compactStatus(action)} failed for ${task.title}.`,
        details: errorMessage(error),
      });
    } finally {
      runBusy(key, false);
    }
  };

  const requestDestructiveTaskAction = (
    task: DelegationTaskRecord,
    action: "cancel" | "fail",
    returnTarget: HTMLButtonElement,
  ) => {
    confirmReturnRef.current = returnTarget;
    setConfirmedAction({ taskId: task.id, action });
  };

  const closeTaskConfirmation = () => {
    setConfirmedAction(null);
    requestAnimationFrame(() => confirmReturnRef.current?.focus());
  };

  useEffect(() => {
    if (!confirmedAction) return;
    requestAnimationFrame(() => confirmDialogRef.current?.focus());
  }, [confirmedAction]);

  const runSupervise = async () => {
    const key = "task:supervise";
    runBusy(key, true);
    try {
      const concurrency = Number(superviseConcurrency);
      await postJson<UnknownRecord>("/delegation/supervise", {
        concurrency:
          Number.isFinite(concurrency) && concurrency > 0
            ? concurrency
            : undefined,
      });
      publishNotice({ tone: "good", message: "Queue supervision completed." });
      refreshDelegation();
    } catch (error) {
      publishNotice({
        tone: "bad",
        message: "Queue supervision failed.",
        details: errorMessage(error),
      });
    } finally {
      runBusy(key, false);
    }
  };

  const onSubmitCreatePlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active || !supportsPlanCreate) {
      publishNotice({
        tone: "bad",
        message: "Plan creation is unavailable in the current runtime.",
        details: asString(planningControl.detail) || undefined,
      });
      return;
    }
    if (!planTitle.trim() || !planObjective.trim()) {
      publishNotice({
        tone: "bad",
        message: "Plan title and objective are required.",
      });
      return;
    }
    const key = "plan:create";
    runBusy(key, true);
    try {
      const result = await postJson<{ plan?: PlanRecord }>("/plans/create", {
        title: planTitle.trim(),
        objective: planObjective.trim(),
        status: planStatus,
        taskId: planTaskId.trim() || undefined,
        workflowId: planWorkflowId.trim() || undefined,
      });
      const nextId = asString(result.plan?.id);
      if (nextId) setSelectedPlanId(nextId);
      setPlanTitle("");
      setPlanObjective("");
      setPlanTaskId("");
      setPlanWorkflowId("");
      setShowPlanCreate(false);
      publishNotice({ tone: "good", message: "Plan created." });
      plansResource.reload();
    } catch (error) {
      publishNotice({
        tone: "bad",
        message: "Plan creation failed.",
        details: errorMessage(error),
      });
    } finally {
      runBusy(key, false);
    }
  };

  const approvePlan = async (plan: PlanRecord) => {
    const key = `plan:${plan.id}:approve`;
    runBusy(key, true);
    try {
      await postJson<{ plan?: PlanRecord }>(
        `/plans/${safeResourceId(plan.id)}/approve`,
        {},
      );
      publishNotice({
        tone: "good",
        message: "Plan approved.",
        details:
          "Approval activates the plan. The linked task still requires a separate explicit execution.",
      });
      plansResource.reload();
    } catch (error) {
      publishNotice({
        tone: "bad",
        message: "Plan approval failed.",
        details: errorMessage(error),
      });
    } finally {
      runBusy(key, false);
    }
  };

  const steerPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPlan || !planSteerInstruction.trim() || !planCanSteer) return;
    const key = `plan:${selectedPlan.id}:steer`;
    runBusy(key, true);
    try {
      await postJson<UnknownRecord>(
        `/plans/${safeResourceId(selectedPlan.id)}/steer`,
        {
          instruction: planSteerInstruction.trim(),
        },
      );
      setPlanSteerInstruction("");
      publishNotice({
        tone: "good",
        message: "Operator steering recorded.",
        details:
          "The instruction will enter the linked task on its next execution or retry.",
      });
      plansResource.reload();
      refreshDelegation();
    } catch (error) {
      publishNotice({
        tone: "bad",
        message: "Plan steering failed.",
        details: errorMessage(error),
      });
    } finally {
      runBusy(key, false);
    }
  };

  const onSubmitCodegen = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active || !codegenReady) {
      publishNotice({
        tone: "bad",
        message: "Code generation is not ready.",
        details: asString(codegenExecution.detail) || undefined,
      });
      return;
    }
    const isQa = codegenMode === "qa";
    if (
      (isQa && !codegenProjectPath.trim()) ||
      (!isQa && (!codegenProjectName.trim() || !codegenPrompt.trim()))
    ) {
      publishNotice({
        tone: "bad",
        message: isQa
          ? "Project path is required for QA."
          : "Project name and request are required.",
      });
      return;
    }
    const key = `codegen:${codegenMode}`;
    runBusy(key, true);
    try {
      const body = isQa
        ? { projectPath: codegenProjectPath.trim() }
        : codegenMode === "generate"
          ? {
              projectName: codegenProjectName.trim(),
              prompt: codegenPrompt.trim(),
            }
          : {
              projectName: codegenProjectName.trim(),
              description: codegenPrompt.trim(),
              targetType: codegenTargetType.trim() || "plugin",
            };
      const result = await postJson<UnknownRecord>(
        `/codegen/${codegenMode}`,
        body,
      );
      const nextWorkflowId = asString(result.workflowId);
      const nextRun = asRecord(
        result.run ?? result.prdRun ?? result.researchRun,
      );
      if (nextWorkflowId) setSelectedWorkflowId(nextWorkflowId);
      if (asString(nextRun.id)) setSelectedRunId(asString(nextRun.id));
      publishNotice({
        tone: "good",
        message: `${CODEGEN_MODES.find((mode) => mode.id === codegenMode)?.label} completed.`,
        details: nextWorkflowId ? `Workflow ${nextWorkflowId}` : undefined,
      });
      setCodegenPrompt("");
      refreshDelegation();
      refreshCodegen();
    } catch (error) {
      publishNotice({
        tone: "bad",
        message: `${compactStatus(codegenMode)} failed.`,
        details: errorMessage(error),
      });
    } finally {
      runBusy(key, false);
    }
  };

  const loadBundle = async () => {
    if (!selectedWorkflow) return;
    const workflowId = selectedWorkflow.id;
    setBundleWorkflowId(workflowId);
    setBundleResult(null);
    setBundleError("");
    setBundleLoading(true);
    try {
      const result = await postJson<WorkflowBundleResponse>(
        `/codegen/workflows/${safeResourceId(workflowId)}/bundle`,
        {},
      );
      setBundleResult(result);
    } catch (error) {
      setBundleError(errorMessage(error));
    } finally {
      setBundleLoading(false);
    }
  };

  const cancelCodegenRun = async (run: CodegenRunRecord) => {
    const key = `codegen:${run.id}:cancel`;
    runBusy(key, true);
    try {
      const result = await postJson<CodegenCancellationResponse>(
        `/codegen/runs/${safeResourceId(run.id)}/cancel`,
        {},
      );
      setConfirmedRunCancellation("");
      publishNotice({
        tone: "warn",
        message: result.cancellation?.alreadyCancelled
          ? "Run was already cancelled."
          : "Run lifecycle marked cancelled.",
        details:
          result.cancellation?.note ?? "The cancellation receipt was recorded.",
      });
      refreshCodegen();
    } catch (error) {
      publishNotice({
        tone: "bad",
        message: "Run cancellation failed.",
        details: errorMessage(error),
      });
    } finally {
      runBusy(key, false);
    }
  };

  const selectTab = (tab: WorkTabId) => {
    setActiveTab(tab);
    onSectionChange?.(tab);
    requestAnimationFrame(() => tabRefs.current[tab]?.focus());
  };

  const moveTab = (direction: -1 | 1) => {
    const index = WORK_TABS.findIndex((entry) => entry.id === activeTab);
    const next =
      WORK_TABS[(index + direction + WORK_TABS.length) % WORK_TABS.length];
    selectTab(next.id);
  };

  const openTaskCreate = (capability: TaskCapability) => {
    setTaskCreateCapability(capability);
    setTaskCreateFramework((current) => current || recommendedPooledFramework);
    setTaskCreateWorkspaceRoot((current) => current || workspacePath || "");
    setShowTaskCreate(true);
  };

  const renderTaskRail = () => {
    if (tasksResource.error) {
      return (
        <ErrorBlock error={tasksResource.error} retry={tasksResource.reload} />
      );
    }
    if (tasksResource.loading) return <LoadingBlock />;
    if (tasks.length === 0) {
      return (
        <EmptyBlock
          actions={
            <button
              className="primary-button"
              disabled={!active}
              onClick={() => openTaskCreate("coding")}
              type="button"
            >
              New coding task
            </button>
          }
          title={
            projectScope === "all"
              ? "No tasks yet"
              : `No tasks for ${workspaceLabel || "this project"}`
          }
        >
          Create a focused task to start an operator workflow in this workspace.
        </EmptyBlock>
      );
    }
    return (
      <ul className="orchestration-master-list">
        {tasks.map((task) => {
          const status = asString(task.status, "pending");
          const tier = orchestrationStatusTier(status);
          return (
            <li key={task.id}>
              <button
                type="button"
                className={
                  task.id === selectedTask?.id
                    ? `orchestration-master-item selected tier-${tier}`
                    : `orchestration-master-item tier-${tier}`
                }
                aria-pressed={task.id === selectedTask?.id}
                onClick={() => {
                  setSelectedTaskId(task.id);
                  setConfirmedAction(null);
                  setShowChildCreate(false);
                }}
              >
                <span className="master-row master-row-top">
                  <span className="master-title-line">
                    <i className="master-status-dot" aria-hidden="true" />
                    <strong>{asString(task.title, "Untitled task")}</strong>
                  </span>
                  <Badge tone={statusTone(status)}>{status}</Badge>
                </span>
                <span className="master-summary">
                  {normalizeText(asString(task.objective), 92)}
                </span>
                <span className="master-row master-row-bottom">
                  <small>
                    {orchestrationTimingLabel({
                      status,
                      startedAt: asString(task.startedAt),
                      completedAt: asString(task.completedAt),
                      updatedAt: asString(task.updatedAt),
                      createdAt: asString(task.createdAt),
                    })}
                  </small>
                  <small>{asString(task.priority, "normal")} priority</small>
                  <small>
                    {taskCapabilityLabel(task.capabilityProfile, task.kind)}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="page orchestration-page">
      <header className="orchestration-header">
        <div>
          <h1>Agent work</h1>
          <p>
            Tasks, active runs, and completed changes
            {projectScope === "all"
              ? " across every project."
              : ` for ${workspaceLabel || "the selected project"}.`}
          </p>
        </div>
        <div className="orchestration-header-metrics">
          <SummaryChip
            label="Queued"
            value={asNumber(effectiveOverview.pending)}
            tone="neutral"
          />
          <SummaryChip
            label="Running"
            value={Math.max(
              asNumber(effectiveOverview.running),
              projectScope === "all" ? workerActiveCount : 0,
            )}
            tone="warn"
          />
          <SummaryChip label="Approval" value={approvalCount} tone="warn" />
          <SummaryChip label="Completed" value={completedCount} tone="good" />
          <button
            className="icon-button orchestration-refresh"
            type="button"
            onClick={refreshAll}
            disabled={!active}
            aria-label="Refresh orchestration data"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </header>

      {notices.length > 0 ? (
        <div aria-live="polite" className="orchestration-notices">
          {notices.slice(-1).map((entry) => (
            <Notice key={entry.id} tone={entry.tone}>
              <strong>{entry.message}</strong>
              {entry.details ? <span>{entry.details}</span> : null}
            </Notice>
          ))}
        </div>
      ) : null}

      <div className="orchestration-nav-row">
        <div
          role="tablist"
          aria-label="Orchestration sections"
          className="orchestration-tabs"
        >
          {WORK_TABS.map((entry) => (
            <button
              key={entry.id}
              ref={(element) => {
                tabRefs.current[entry.id] = element;
              }}
              id={`orchestration-tab-${entry.id}`}
              role="tab"
              type="button"
              aria-controls={`orchestration-panel-${entry.id}`}
              aria-selected={entry.id === activeTab}
              disabled={!active}
              tabIndex={entry.id === activeTab ? 0 : -1}
              className={entry.id === activeTab ? "selected" : ""}
              onClick={() => selectTab(entry.id)}
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  moveTab(-1);
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  moveTab(1);
                }
                if (event.key === "Home") {
                  event.preventDefault();
                  selectTab(WORK_TABS[0].id);
                }
                if (event.key === "End") {
                  event.preventDefault();
                  selectTab(WORK_TABS.at(-1)?.id ?? "review");
                }
              }}
            >
              {entry.label}
              {entry.id === "tasks" ? <span>{tasks.length}</span> : null}
              {entry.id === "agents" ? <span>{workers.length}</span> : null}
              {entry.id === "plans" ? <span>{plans.length}</span> : null}
              {entry.id === "runs" ? <span>{runs.length}</span> : null}
              {entry.id === "review" && approvalCount > 0 ? (
                <span>{approvalCount}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="orchestration-command-bar">
          {activeTab === "tasks" ? (
            <>
              <label>
                <span>Parallel</span>
                <input
                  aria-label="Supervision concurrency"
                  inputMode="numeric"
                  value={superviseConcurrency}
                  onChange={(event) =>
                    setSuperviseConcurrency(event.target.value)
                  }
                  disabled={!active || busyKeys["task:supervise"]}
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={runSupervise}
                disabled={!active || busyKeys["task:supervise"]}
              >
                {busyKeys["task:supervise"] ? "Supervising…" : "Supervise"}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => openTaskCreate("coding")}
                aria-expanded={showTaskCreate}
                disabled={!active}
              >
                New coding task
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => openTaskCreate("research")}
                aria-expanded={showTaskCreate}
                disabled={!active}
              >
                New research task
              </button>
            </>
          ) : null}
          {activeTab === "plans" ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => setShowPlanCreate((current) => !current)}
              aria-expanded={showPlanCreate}
              disabled={!active || !supportsPlanCreate}
              title={
                supportsPlanCreate
                  ? "Create an execution plan"
                  : asString(
                      planningControl.detail,
                      "Plan creation is unavailable.",
                    )
              }
            >
              New plan
            </button>
          ) : null}
        </div>
      </div>

      {!active ? (
        <Notice tone="warn">
          <strong>Runtime unavailable.</strong>
          <span>Commands unlock when the local runtime is ready.</span>
        </Notice>
      ) : null}

      {activeTab === "tasks" && showTaskCreate ? (
        <form
          className="orchestration-quick-create"
          onSubmit={onSubmitCreateTask}
        >
          <label className="quick-title">
            <span>Title</span>
            <input
              value={taskCreateTitle}
              onChange={(event) => setTaskCreateTitle(event.target.value)}
              placeholder="Ship the settings accessibility pass"
              disabled={!active || busyKeys["task:create"]}
            />
          </label>
          <label className="quick-objective">
            <span>Objective</span>
            <input
              value={taskCreateObjective}
              onChange={(event) => setTaskCreateObjective(event.target.value)}
              placeholder="Define the exact result and evidence expected"
              disabled={!active || busyKeys["task:create"]}
            />
          </label>
          <label>
            <span>Work type</span>
            <select
              aria-label="Task work type"
              value={taskCreateCapability}
              onChange={(event) =>
                setTaskCreateCapability(event.target.value as TaskCapability)
              }
              disabled={!active || busyKeys["task:create"]}
            >
              <option value="coding">Coding</option>
              <option value="research">Research</option>
            </select>
          </label>
          <label>
            <span>Framework</span>
            <select
              aria-label="Task framework"
              value={taskCreateFramework}
              onChange={(event) => setTaskCreateFramework(event.target.value)}
              disabled={!active || busyKeys["task:create"]}
            >
              <option value="">Automatic (Eliza chooses)</option>
              <option value="codex">Codex · uses Codex pool</option>
              <option value="claude">Claude · uses Claude pool</option>
            </select>
          </label>
          <label>
            <span>Group</span>
            <input
              value={taskCreateGroup}
              onChange={(event) => setTaskCreateGroup(event.target.value)}
              placeholder="product"
              disabled={!active || busyKeys["task:create"]}
            />
          </label>
          <label>
            <span>Priority</span>
            <select
              value={taskCreatePriority}
              onChange={(event) =>
                setTaskCreatePriority(
                  event.target.value as "" | "low" | "normal" | "high",
                )
              }
              disabled={!active || busyKeys["task:create"]}
            >
              <option value="">default</option>
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
            </select>
          </label>
          <label>
            <span>Worktree</span>
            <select
              aria-label="Task execution worktree"
              value={taskCreateWorkspaceRoot}
              onChange={(event) =>
                setTaskCreateWorkspaceRoot(event.target.value)
              }
              disabled={!active || busyKeys["task:create"]}
            >
              <option value="">Current workspace</option>
              {worktrees.map((worktree) => (
                <option key={worktree.path} value={worktree.path}>
                  {worktree.branch ??
                    (worktree.detached ? "detached" : "worktree")}{" "}
                  · {compactPath(worktree.path)}
                </option>
              ))}
            </select>
          </label>
          <div className="quick-create-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={
                !active ||
                busyKeys["task:create"] ||
                !taskCreateTitle.trim() ||
                !taskCreateObjective.trim()
              }
            >
              {busyKeys["task:create"] ? "Creating…" : "Create task"}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setShowTaskCreate(false)}
            >
              Close
            </button>
          </div>
          <p className="orchestration-task-routing-note">
            Codex and Claude choose an eligible account from their provider pool
            when this delegated session starts. Automatic may choose a different
            installed framework. The session receipt is the authoritative
            account attribution.
          </p>
          {accountPoolResource.error ? (
            <p className="orchestration-task-routing-note" role="status">
              Account options could not be refreshed. You can still use
              automatic routing.
              <button
                className="text-button"
                type="button"
                onClick={accountPoolResource.reload}
              >
                Retry account options
              </button>
            </p>
          ) : null}
        </form>
      ) : null}

      {activeTab === "plans" && showPlanCreate ? (
        <form
          className="orchestration-quick-create"
          onSubmit={onSubmitCreatePlan}
        >
          <label className="quick-title">
            <span>Title</span>
            <input
              value={planTitle}
              onChange={(event) => setPlanTitle(event.target.value)}
              disabled={!active || busyKeys["plan:create"]}
            />
          </label>
          <label className="quick-objective">
            <span>Objective</span>
            <input
              value={planObjective}
              onChange={(event) => setPlanObjective(event.target.value)}
              disabled={!active || busyKeys["plan:create"]}
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={planStatus}
              onChange={(event) =>
                setPlanStatus(
                  event.target.value as "draft" | "active" | "completed",
                )
              }
              disabled={!active || busyKeys["plan:create"]}
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="completed">completed</option>
            </select>
          </label>
          <label>
            <span>Task ID</span>
            <input
              value={planTaskId}
              onChange={(event) => setPlanTaskId(event.target.value)}
              placeholder="optional"
              disabled={!active || busyKeys["plan:create"]}
            />
          </label>
          <label>
            <span>Workflow ID</span>
            <input
              value={planWorkflowId}
              onChange={(event) => setPlanWorkflowId(event.target.value)}
              placeholder="optional"
              disabled={!active || busyKeys["plan:create"]}
            />
          </label>
          <div className="quick-create-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={
                !active ||
                !supportsPlanCreate ||
                busyKeys["plan:create"] ||
                !planTitle.trim() ||
                !planObjective.trim()
              }
            >
              {busyKeys["plan:create"] ? "Creating…" : "Create plan"}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setShowPlanCreate(false)}
            >
              Close
            </button>
          </div>
        </form>
      ) : null}

      <section
        id={`orchestration-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`orchestration-tab-${activeTab}`}
        className="orchestration-panel"
      >
        {activeTab === "review" ? (
          <ReviewPage
            active={active}
            embedded
            onSendToChat={onSendToChat}
            projectScope={projectScope}
            workspacePath={workspacePath ?? ""}
          />
        ) : activeTab === "tasks" ? (
          <div className="orchestration-master-detail">
            <aside className="orchestration-master">
              <div className="orchestration-pane-heading">
                <span>Queue</span>
                <small>
                  {asNumber(effectiveOverview.total)} total
                  {projectScope === "all"
                    ? ""
                    : ` · ${workspaceLabel || "selected project"}`}
                </small>
              </div>
              <div className="orchestration-scroll">{renderTaskRail()}</div>
            </aside>

            <article className="orchestration-detail">
              {!selectedTask ? (
                <EmptyBlock title="Choose a task">
                  Task controls and evidence appear here.
                </EmptyBlock>
              ) : (
                <>
                  <div className="orchestration-detail-header">
                    <div>
                      <span className="detail-kicker">
                        {asString(selectedTask.group, "ungrouped")} /{" "}
                        {taskCapabilityLabel(
                          selectedTask.capabilityProfile,
                          selectedTask.kind,
                        )}{" "}
                        ·{" "}
                        {asString(
                          selectedTask.framework,
                          selectedTask.profile || "automatic",
                        )}
                      </span>
                      <h2>{selectedTask.title}</h2>
                      <p>{selectedTask.objective}</p>
                    </div>
                    <Badge
                      tone={statusTone(
                        asString(selectedTask.status, "pending"),
                      )}
                    >
                      {asString(selectedTask.status, "pending")}
                    </Badge>
                  </div>

                  <div className="orchestration-detail-tags">
                    <DetailTag
                      tone={statusTone(
                        asString(selectedTask.status, "pending"),
                      )}
                    >
                      {orchestrationTimingLabel({
                        status: asString(selectedTask.status, "pending"),
                        startedAt: asString(selectedTask.startedAt),
                        completedAt: asString(selectedTask.completedAt),
                        updatedAt: asString(selectedTask.updatedAt),
                        createdAt: asString(selectedTask.createdAt),
                      })}
                    </DetailTag>
                    <DetailTag>
                      {taskExecutionLabel(selectedTask.executionMode)}
                    </DetailTag>
                    <DetailTag>
                      {asString(selectedTask.priority, "normal")} priority
                    </DetailTag>
                    <DetailTag>
                      {selectedTask.workerPid
                        ? `PID ${selectedTask.workerPid}`
                        : "No live worker"}
                    </DetailTag>
                    <DetailTag>
                      {selectedTask.accountLabel || selectedTask.accountId
                        ? `account ${selectedTask.accountLabel || selectedTask.accountId}`
                        : "automatic account routing"}
                    </DetailTag>
                  </div>

                  <div className="orchestration-action-deck">
                    <div className="orchestration-action-main">
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => runTaskAction(selectedTask, "execute")}
                        disabled={
                          !active || busyKeys[`task:${selectedTask.id}:execute`]
                        }
                      >
                        Execute
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => runTaskAction(selectedTask, "run")}
                        disabled={
                          !active || busyKeys[`task:${selectedTask.id}:run`]
                        }
                      >
                        Mark running
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => runTaskAction(selectedTask, "complete")}
                        disabled={
                          !active ||
                          busyKeys[`task:${selectedTask.id}:complete`]
                        }
                      >
                        Complete
                      </button>
                    </div>
                    <div className="orchestration-action-secondary">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => runTaskAction(selectedTask, "retry")}
                        disabled={
                          !active || busyKeys[`task:${selectedTask.id}:retry`]
                        }
                      >
                        Retry
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          setShowChildCreate((current) => {
                            const next = !current;
                            if (next) {
                              setChildWorkspaceRoot(
                                asString(selectedTask.workspaceRoot),
                              );
                            }
                            return next;
                          })
                        }
                        aria-expanded={showChildCreate}
                        disabled={!active}
                      >
                        Add child
                      </button>
                      <button
                        className="text-button danger-text-button"
                        type="button"
                        onClick={(event) =>
                          requestDestructiveTaskAction(
                            selectedTask,
                            "fail",
                            event.currentTarget,
                          )
                        }
                        disabled={
                          !active || busyKeys[`task:${selectedTask.id}:fail`]
                        }
                      >
                        Mark failed
                      </button>
                      <button
                        className="text-button danger-text-button"
                        type="button"
                        onClick={(event) =>
                          requestDestructiveTaskAction(
                            selectedTask,
                            "cancel",
                            event.currentTarget,
                          )
                        }
                        disabled={
                          !active || busyKeys[`task:${selectedTask.id}:cancel`]
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  {confirmedAction?.taskId === selectedTask.id ? (
                    <div
                      className="orchestration-confirm"
                      aria-live="polite"
                      ref={confirmDialogRef}
                      tabIndex={-1}
                    >
                      <div>
                        <strong id="task-confirm-title">
                          {confirmedAction.action === "fail"
                            ? "Mark this task failed?"
                            : "Cancel this task?"}
                        </strong>
                        <span id="task-confirm-description">
                          This changes task state
                          {cascadeChildren ? " and includes child tasks" : ""}.
                        </span>
                      </div>
                      <label>
                        <input
                          type="checkbox"
                          checked={cascadeChildren}
                          onChange={(event) =>
                            setCascadeChildren(event.target.checked)
                          }
                        />
                        Cascade to children
                      </label>
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() =>
                          runTaskAction(selectedTask, confirmedAction.action)
                        }
                        disabled={!active}
                      >
                        Confirm {confirmedAction.action}
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={closeTaskConfirmation}
                      >
                        Keep task
                      </button>
                    </div>
                  ) : null}

                  {showChildCreate ? (
                    <form
                      className="orchestration-inline-form"
                      onSubmit={onSubmitSpawn}
                    >
                      <label>
                        <span>Child title</span>
                        <input
                          value={childTitle}
                          onChange={(event) =>
                            setChildTitle(event.target.value)
                          }
                          placeholder="Child task"
                          disabled={
                            !active || busyKeys[`task:${selectedTask.id}:spawn`]
                          }
                        />
                      </label>
                      <label className="inline-form-wide">
                        <span>Child objective</span>
                        <input
                          value={childObjective}
                          onChange={(event) =>
                            setChildObjective(event.target.value)
                          }
                          placeholder="A bounded piece of the parent objective"
                          required
                          disabled={
                            !active || busyKeys[`task:${selectedTask.id}:spawn`]
                          }
                        />
                      </label>
                      <label>
                        <span>Execution worktree</span>
                        <select
                          aria-label="Child execution worktree"
                          value={childWorkspaceRoot}
                          onChange={(event) =>
                            setChildWorkspaceRoot(event.target.value)
                          }
                          disabled={
                            !active || busyKeys[`task:${selectedTask.id}:spawn`]
                          }
                        >
                          <option value="">Inherit parent worktree</option>
                          {worktrees.map((worktree) => (
                            <option key={worktree.path} value={worktree.path}>
                              {worktree.branch ??
                                (worktree.detached
                                  ? "detached"
                                  : "worktree")}{" "}
                              · {compactPath(worktree.path)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="secondary-button"
                        type="submit"
                        disabled={
                          !active ||
                          !childObjective.trim() ||
                          busyKeys[`task:${selectedTask.id}:spawn`]
                        }
                      >
                        {busyKeys[`task:${selectedTask.id}:spawn`]
                          ? "Spawning…"
                          : "Spawn"}
                      </button>
                    </form>
                  ) : null}

                  <div className="orchestration-detail-grid">
                    <dl>
                      <DetailRow label="Task ID" value={selectedTask.id} />
                      <DetailRow
                        label="Attempts"
                        value={`${asNumber(selectedTask.attempts)} / ${asNumber(
                          selectedTask.maxAttempts,
                          1,
                        )}`}
                      />
                      <DetailRow
                        label="Priority"
                        value={asString(selectedTask.priority, "normal")}
                      />
                      <DetailRow
                        label="Execution"
                        value={taskExecutionLabel(selectedTask.executionMode)}
                      />
                      <DetailRow
                        label="Capability"
                        value={taskCapabilityLabel(
                          selectedTask.capabilityProfile,
                          selectedTask.kind,
                        )}
                      />
                      <DetailRow
                        label="Framework"
                        value={asString(selectedTask.framework, "automatic")}
                      />
                      <DetailRow
                        label="Account provider"
                        value={asString(
                          selectedTask.accountProviderId,
                          "automatic",
                        )}
                      />
                      <DetailRow
                        label="Account"
                        value={asString(
                          selectedTask.accountLabel,
                          asString(selectedTask.accountId, "automatic"),
                        )}
                      />
                      <DetailRow
                        label="Session"
                        value={asString(selectedTask.sessionId, "not assigned")}
                      />
                      <DetailRow
                        label="Execution root"
                        value={
                          selectedTask.workspaceRoot
                            ? compactPath(selectedTask.workspaceRoot)
                            : "current workspace"
                        }
                      />
                      <DetailRow
                        label="Updated"
                        value={displayTimestamp(
                          asString(selectedTask.updatedAt),
                        )}
                      />
                      <DetailRow
                        label="Worker PID"
                        value={selectedTask.workerPid}
                      />
                    </dl>
                    <div className="orchestration-evidence">
                      <span className="detail-kicker">Evidence</span>
                      {selectedTask.lastOutputPath ? (
                        <code>{selectedTask.lastOutputPath}</code>
                      ) : (
                        <SmallEmpty>No artifact path reported.</SmallEmpty>
                      )}
                      <span className="detail-kicker">Task notes</span>
                      {asArray(selectedTask.notes).length > 0 ? (
                        <ul>
                          {asArray(selectedTask.notes)
                            .slice(-5)
                            .map((note) => (
                              <li
                                key={`${selectedTask.id}:note:${asString(note)}`}
                              >
                                {asString(note)}
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <SmallEmpty>No notes recorded.</SmallEmpty>
                      )}
                    </div>
                  </div>

                  <form
                    className="orchestration-note-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      runTaskAction(selectedTask, "note");
                    }}
                  >
                    <label>
                      <span>Operator note</span>
                      <textarea
                        rows={2}
                        value={selectedTaskNote}
                        onChange={(event) =>
                          setTaskNotes((current) => ({
                            ...current,
                            [selectedTask.id]: event.target.value,
                          }))
                        }
                        placeholder="Record context for this task. Notes stay isolated per task."
                        disabled={
                          !active || busyKeys[`task:${selectedTask.id}:note`]
                        }
                      />
                    </label>
                    <button
                      className="secondary-button"
                      type="submit"
                      disabled={
                        !active ||
                        !selectedTaskNote.trim() ||
                        busyKeys[`task:${selectedTask.id}:note`]
                      }
                    >
                      {busyKeys[`task:${selectedTask.id}:note`]
                        ? "Adding…"
                        : "Add note"}
                    </button>
                  </form>
                </>
              )}
            </article>
          </div>
        ) : null}

        {activeTab === "agents" ? (
          <div className="orchestration-master-detail">
            <aside className="orchestration-master">
              <div className="orchestration-pane-heading">
                <span>Agent roster</span>
                <small>{workers.length} workers</small>
              </div>
              <div className="orchestration-health-strip">
                <span>
                  <strong>{asNumber(workerOverview.activeWorkers)}</strong>{" "}
                  active
                </span>
                <span>
                  <strong>{asNumber(workerOverview.aliveWorkers)}</strong> alive
                </span>
                <span>
                  <strong>{asNumber(workerOverview.stalledWorkers)}</strong>{" "}
                  stalled
                </span>
              </div>
              <div className="orchestration-scroll">
                {workersResource.error ? (
                  <ErrorBlock
                    error={workersResource.error}
                    retry={workersResource.reload}
                  />
                ) : workersResource.loading ? (
                  <LoadingBlock />
                ) : workers.length === 0 ? (
                  <EmptyBlock title="No active workers">
                    Workers appear as delegated tasks execute.
                  </EmptyBlock>
                ) : (
                  <ul className="orchestration-master-list">
                    {workers.map((worker) => {
                      const status = asString(worker.status, "idle");
                      const tier = orchestrationStatusTier(status);
                      return (
                        <li key={worker.id}>
                          <button
                            type="button"
                            className={
                              worker.id === selectedWorker?.id
                                ? `orchestration-master-item selected tier-${tier}`
                                : `orchestration-master-item tier-${tier}`
                            }
                            aria-pressed={worker.id === selectedWorker?.id}
                            onClick={() => setSelectedWorkerId(worker.id)}
                          >
                            <span className="master-row master-row-top">
                              <span className="master-title-line">
                                <i
                                  className="master-status-dot"
                                  aria-hidden="true"
                                />
                                <strong>
                                  {asString(worker.title, worker.id)}
                                </strong>
                              </span>
                              <Badge tone={statusTone(status)}>{status}</Badge>
                            </span>
                            <span className="master-summary">
                              {normalizeText(
                                asString(worker.objective, "No objective"),
                                92,
                              )}
                            </span>
                            <span className="master-row master-row-bottom">
                              <small>
                                {orchestrationTimingLabel({
                                  status,
                                  startedAt: asString(worker.startedAt),
                                  completedAt: asString(worker.completedAt),
                                })}
                              </small>
                              <small>
                                {worker.stalled
                                  ? "Stalled"
                                  : worker.alive
                                    ? "Heartbeat ok"
                                    : "Offline"}
                              </small>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>
            <article className="orchestration-detail">
              {!selectedWorker ? (
                <EmptyBlock title="Choose an agent">
                  Worker health and evidence appear here.
                </EmptyBlock>
              ) : (
                <>
                  <div className="orchestration-detail-header">
                    <div>
                      <span className="detail-kicker">
                        {asString(selectedWorker.group, "ungrouped")} /{" "}
                        {taskCapabilityLabel(
                          selectedWorker.capabilityProfile,
                          selectedWorker.kind,
                        )}{" "}
                        ·{" "}
                        {asString(
                          selectedWorker.framework,
                          selectedWorker.profile || "automatic",
                        )}
                      </span>
                      <h2>
                        {asString(selectedWorker.title, selectedWorker.id)}
                      </h2>
                      <p>
                        {asString(
                          selectedWorker.objective,
                          "No objective reported.",
                        )}
                      </p>
                    </div>
                    <Badge
                      tone={statusTone(asString(selectedWorker.status, "idle"))}
                    >
                      {asString(selectedWorker.status, "idle")}
                    </Badge>
                  </div>
                  <div className="orchestration-detail-tags">
                    <DetailTag
                      tone={statusTone(asString(selectedWorker.status, "idle"))}
                    >
                      {orchestrationTimingLabel({
                        status: asString(selectedWorker.status, "idle"),
                        startedAt: asString(selectedWorker.startedAt),
                        completedAt: asString(selectedWorker.completedAt),
                      })}
                    </DetailTag>
                    <DetailTag>
                      {asString(
                        selectedWorker.workerMode,
                        asString(selectedWorker.executionMode, "local"),
                      )}
                    </DetailTag>
                    <DetailTag tone={selectedWorker.alive ? "good" : "bad"}>
                      {selectedWorker.alive ? "worker alive" : "worker offline"}
                    </DetailTag>
                    <DetailTag tone={selectedWorker.stalled ? "bad" : "good"}>
                      {selectedWorker.stalled ? "stalled" : "progressing"}
                    </DetailTag>
                  </div>
                  <div className="orchestration-detail-grid">
                    <dl>
                      <DetailRow label="Worker ID" value={selectedWorker.id} />
                      <DetailRow
                        label="Capability"
                        value={taskCapabilityLabel(
                          selectedWorker.capabilityProfile,
                          selectedWorker.kind,
                        )}
                      />
                      <DetailRow
                        label="Framework"
                        value={asString(selectedWorker.framework, "automatic")}
                      />
                      <DetailRow
                        label="Account provider"
                        value={asString(
                          selectedWorker.accountProviderId,
                          "automatic",
                        )}
                      />
                      <DetailRow
                        label="Account"
                        value={asString(
                          selectedWorker.accountLabel,
                          asString(selectedWorker.accountId, "automatic"),
                        )}
                      />
                      <DetailRow
                        label="Session"
                        value={asString(
                          selectedWorker.sessionId,
                          "not assigned",
                        )}
                      />
                      <DetailRow label="PID" value={selectedWorker.workerPid} />
                      <DetailRow
                        label="Mode"
                        value={asString(
                          selectedWorker.workerMode,
                          asString(selectedWorker.executionMode, "local"),
                        )}
                      />
                      <DetailRow
                        label="Attempts"
                        value={asNumber(selectedWorker.attempts)}
                      />
                      <DetailRow
                        label="Remaining"
                        value={asNumber(selectedWorker.attemptsRemaining)}
                      />
                      <DetailRow
                        label="Parent task"
                        value={selectedWorker.parentTaskId}
                      />
                    </dl>
                    <div className="orchestration-evidence">
                      <span className="detail-kicker">Runtime health</span>
                      <div className="orchestration-signal-grid">
                        <span className={selectedWorker.alive ? "good" : "bad"}>
                          {selectedWorker.alive ? "Alive" : "Not alive"}
                        </span>
                        <span
                          className={selectedWorker.stalled ? "bad" : "good"}
                        >
                          {selectedWorker.stalled ? "Stalled" : "Progressing"}
                        </span>
                      </div>
                      <span className="detail-kicker">Latest artifact</span>
                      {selectedWorker.lastOutputPath ? (
                        <code>{selectedWorker.lastOutputPath}</code>
                      ) : (
                        <SmallEmpty>No artifact path reported.</SmallEmpty>
                      )}
                    </div>
                  </div>
                </>
              )}
            </article>
          </div>
        ) : null}

        {activeTab === "plans" ? (
          <div className="orchestration-master-detail">
            <aside className="orchestration-master">
              <div className="orchestration-pane-heading">
                <span>Plans</span>
                <small>{plans.length} records</small>
              </div>
              <div className="orchestration-scroll">
                {plansResource.error ? (
                  <ErrorBlock
                    error={plansResource.error}
                    retry={plansResource.reload}
                  />
                ) : plansResource.loading ? (
                  <LoadingBlock />
                ) : plans.length === 0 ? (
                  <EmptyBlock title="No plans yet">
                    Create a plan to connect tasks and workflows.
                  </EmptyBlock>
                ) : (
                  <ul className="orchestration-master-list">
                    {plans.map((plan) => {
                      const status = asString(plan.status, "draft");
                      const tier = orchestrationStatusTier(status);
                      return (
                        <li key={plan.id}>
                          <button
                            type="button"
                            className={
                              plan.id === selectedPlan?.id
                                ? `orchestration-master-item selected tier-${tier}`
                                : `orchestration-master-item tier-${tier}`
                            }
                            aria-pressed={plan.id === selectedPlan?.id}
                            onClick={() => setSelectedPlanId(plan.id)}
                          >
                            <span className="master-row master-row-top">
                              <span className="master-title-line">
                                <i
                                  className="master-status-dot"
                                  aria-hidden="true"
                                />
                                <strong>
                                  {asString(plan.title, "Untitled plan")}
                                </strong>
                              </span>
                              <Badge tone={statusTone(status)}>{status}</Badge>
                            </span>
                            <span className="master-summary">
                              {normalizeText(asString(plan.objective), 92)}
                            </span>
                            <span className="master-row master-row-bottom">
                              <small>
                                {orchestrationTimingLabel({
                                  status,
                                  updatedAt: asString(plan.updatedAt),
                                  createdAt: asString(plan.createdAt),
                                })}
                              </small>
                              <small>
                                {asArray(plan.steps).length} step
                                {asArray(plan.steps).length === 1 ? "" : "s"}
                              </small>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>
            <article className="orchestration-detail">
              {!selectedPlan ? (
                <EmptyBlock title="Choose a plan">
                  Plan links and steps appear here.
                </EmptyBlock>
              ) : (
                <>
                  <div className="orchestration-detail-header">
                    <div>
                      <span className="detail-kicker">Execution plan</span>
                      <h2>{asString(selectedPlan.title, "Untitled plan")}</h2>
                      <p>{asString(selectedPlan.objective)}</p>
                    </div>
                    <Badge
                      tone={statusTone(asString(selectedPlan.status, "draft"))}
                    >
                      {asString(selectedPlan.status, "draft")}
                    </Badge>
                  </div>
                  <div className="orchestration-detail-tags">
                    <DetailTag
                      tone={statusTone(asString(selectedPlan.status, "draft"))}
                    >
                      {orchestrationTimingLabel({
                        status: asString(selectedPlan.status, "draft"),
                        updatedAt: asString(selectedPlan.updatedAt),
                        createdAt: asString(selectedPlan.createdAt),
                      })}
                    </DetailTag>
                    <DetailTag>
                      {selectedPlan.taskId ? "task linked" : "task unlinked"}
                    </DetailTag>
                    <DetailTag>
                      {selectedPlan.workflowId
                        ? "workflow linked"
                        : "workflow unlinked"}
                    </DetailTag>
                    <DetailTag>
                      {asArray(selectedPlan.steps).length} steps
                    </DetailTag>
                  </div>
                  {asString(selectedPlan.status) === "draft" ? (
                    <div className="orchestration-plan-control">
                      <div>
                        <strong>Ready for operator review</strong>
                        <span>
                          Approval activates this plan but never starts its
                          linked task automatically.
                        </span>
                      </div>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => void approvePlan(selectedPlan)}
                        disabled={
                          !active || busyKeys[`plan:${selectedPlan.id}:approve`]
                        }
                      >
                        {busyKeys[`plan:${selectedPlan.id}:approve`]
                          ? "Approving…"
                          : "Approve plan"}
                      </button>
                    </div>
                  ) : null}
                  {asString(selectedPlan.status) === "active" ? (
                    <form
                      className="orchestration-plan-steer"
                      onSubmit={steerPlan}
                    >
                      <div>
                        <strong>Steer the next run</strong>
                        <span>
                          {planCanSteer
                            ? "This instruction is added to the linked pending task and applies on its next execution or retry."
                            : selectedPlan.taskId
                              ? `Steering is available only while the linked local task is pending. Current state: ${asString(
                                  linkedPlanTask?.status,
                                  linkedPlanTask ? "unknown" : "not local",
                                )}.`
                              : "Link this plan to a local pending task before adding operator steering."}
                        </span>
                      </div>
                      <label>
                        <span className="sr-only">
                          Instruction for the linked task
                        </span>
                        <textarea
                          maxLength={4000}
                          rows={2}
                          value={planSteerInstruction}
                          onChange={(event) =>
                            setPlanSteerInstruction(event.target.value)
                          }
                          placeholder="Change scope, constraints, or acceptance checks…"
                          disabled={
                            !active ||
                            !planCanSteer ||
                            busyKeys[`plan:${selectedPlan.id}:steer`]
                          }
                        />
                      </label>
                      <button
                        className="secondary-button"
                        type="submit"
                        disabled={
                          !active ||
                          !planCanSteer ||
                          !planSteerInstruction.trim() ||
                          busyKeys[`plan:${selectedPlan.id}:steer`]
                        }
                      >
                        {busyKeys[`plan:${selectedPlan.id}:steer`]
                          ? "Recording…"
                          : "Add steering"}
                      </button>
                    </form>
                  ) : null}
                  <div className="orchestration-detail-grid">
                    <dl>
                      <DetailRow label="Plan ID" value={selectedPlan.id} />
                      <DetailRow
                        label="Task"
                        value={asString(selectedPlan.taskId, "not linked")}
                      />
                      <DetailRow
                        label="Workflow"
                        value={asString(selectedPlan.workflowId, "not linked")}
                      />
                      <DetailRow
                        label="Created"
                        value={displayTimestamp(
                          asString(selectedPlan.createdAt),
                        )}
                      />
                      <DetailRow
                        label="Updated"
                        value={displayTimestamp(
                          asString(selectedPlan.updatedAt),
                        )}
                      />
                    </dl>
                    <div className="orchestration-evidence">
                      <span className="detail-kicker">Steps</span>
                      {asArray(selectedPlan.steps).length > 0 ? (
                        <ol className="orchestration-steps">
                          {asArray(selectedPlan.steps).map((step) => (
                            <li
                              key={`${selectedPlan.id}:step:${asString(step)}`}
                            >
                              {asString(step)}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <SmallEmpty>No steps recorded.</SmallEmpty>
                      )}
                      <span className="detail-kicker">Metadata</span>
                      {Object.keys(asRecord(selectedPlan.metadata)).length >
                      0 ? (
                        <dl className="orchestration-mini-dl">
                          {Object.entries(asRecord(selectedPlan.metadata)).map(
                            ([key, value]) => (
                              <DetailRow
                                key={`${selectedPlan.id}:${key}`}
                                label={key}
                                value={compactDetailValue(value)}
                              />
                            ),
                          )}
                        </dl>
                      ) : (
                        <SmallEmpty>No plan metadata.</SmallEmpty>
                      )}
                    </div>
                  </div>
                  {planMetaLines.length > 0 ? (
                    <div className="orchestration-control-footnote">
                      <strong>Control plane</strong>
                      <span>{planMetaLines.join(" · ")}</span>
                    </div>
                  ) : null}
                </>
              )}
            </article>
          </div>
        ) : null}

        {activeTab === "runs" ? (
          <div className="orchestration-runs-layout">
            <aside className="orchestration-launcher">
              {codegenRuntimeResource.error ? (
                <ErrorBlock
                  error={codegenRuntimeResource.error}
                  retry={codegenRuntimeResource.reload}
                />
              ) : null}
              <div className="orchestration-pane-heading">
                <span>New workflow</span>
                <Badge
                  tone={
                    codegenReady ? "good" : codegenAvailable ? "warn" : "bad"
                  }
                >
                  {codegenReady
                    ? "ready"
                    : codegenAvailable
                      ? "setup needed"
                      : "offline"}
                </Badge>
              </div>
              <fieldset className="orchestration-mode-grid">
                <legend>Code generation mode</legend>
                {CODEGEN_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={codegenMode === mode.id}
                    className={codegenMode === mode.id ? "selected" : ""}
                    onClick={() => setCodegenMode(mode.id)}
                  >
                    <strong>{mode.label}</strong>
                    <span>{mode.detail}</span>
                  </button>
                ))}
              </fieldset>
              <form
                className="orchestration-codegen-form"
                onSubmit={onSubmitCodegen}
              >
                {codegenMode === "qa" ? (
                  <label>
                    <span>Project path</span>
                    <input
                      value={codegenProjectPath}
                      onChange={(event) =>
                        setCodegenProjectPath(event.target.value)
                      }
                      placeholder="/workspace/project"
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      <span>Project name</span>
                      <input
                        value={codegenProjectName}
                        onChange={(event) =>
                          setCodegenProjectName(event.target.value)
                        }
                        placeholder={workspaceLabel || "doolittle"}
                      />
                    </label>
                    {codegenMode !== "generate" ? (
                      <label>
                        <span>Target</span>
                        <input
                          value={codegenTargetType}
                          onChange={(event) =>
                            setCodegenTargetType(event.target.value)
                          }
                          placeholder="plugin"
                        />
                      </label>
                    ) : null}
                    <label>
                      <span>
                        {codegenMode === "generate"
                          ? "Build request"
                          : "Description"}
                      </span>
                      <textarea
                        rows={6}
                        value={codegenPrompt}
                        onChange={(event) =>
                          setCodegenPrompt(event.target.value)
                        }
                        placeholder="Describe the intended result, constraints, and evidence."
                      />
                    </label>
                  </>
                )}
                <button
                  className="primary-button"
                  type="submit"
                  disabled={
                    !active ||
                    !codegenReady ||
                    busyKeys[`codegen:${codegenMode}`]
                  }
                >
                  {busyKeys[`codegen:${codegenMode}`]
                    ? "Running…"
                    : `Run ${
                        CODEGEN_MODES.find((mode) => mode.id === codegenMode)
                          ?.label
                      }`}
                </button>
              </form>
              <p className="orchestration-runtime-version">
                {asString(codegenExecution.source, "product")} engine ·{" "}
                {asArray(codegenExecution.methods).length} methods ·{" "}
                {asNumber(workflowSummary.total)} workflows
              </p>
              {!codegenReady && asString(codegenExecution.detail) ? (
                <p className="orchestration-runtime-detail">
                  {asString(codegenExecution.detail)}
                </p>
              ) : null}
              <p className="orchestration-task-routing-note">
                {workspacePath
                  ? `Project defaults come from ${compactPath(workspacePath)}. QA uses this path directly; other workflows retain the selected project name in their receipt.`
                  : "Choose a workspace to prefill project context for build and research receipts."}
              </p>
            </aside>

            <aside className="orchestration-run-browser">
              <div className="orchestration-pane-heading">
                <span>Workflows</span>
                <small>{workflows.length}</small>
              </div>
              <div className="orchestration-workflow-list">
                {codegenWorkflowsResource.error ? (
                  <ErrorBlock
                    error={codegenWorkflowsResource.error}
                    retry={codegenWorkflowsResource.reload}
                  />
                ) : codegenWorkflowsResource.loading ? (
                  <LoadingBlock />
                ) : workflows.length === 0 ? (
                  <SmallEmpty>No workflows recorded.</SmallEmpty>
                ) : (
                  workflows.map((workflow) => {
                    const status = asString(workflow.status, "pending");
                    const tier = orchestrationStatusTier(status);
                    return (
                      <button
                        key={workflow.id}
                        type="button"
                        className={
                          selectedWorkflow?.id === workflow.id
                            ? `selected tier-${tier}`
                            : `tier-${tier}`
                        }
                        aria-pressed={selectedWorkflow?.id === workflow.id}
                        onClick={() => {
                          setSelectedWorkflowId(workflow.id);
                          setSelectedRunId("");
                          setBundleWorkflowId("");
                          setBundleResult(null);
                          setBundleError("");
                        }}
                      >
                        <span className="master-row master-row-top">
                          <span className="master-title-line">
                            <i
                              className="master-status-dot"
                              aria-hidden="true"
                            />
                            <strong>
                              {asString(workflow.title, workflow.id)}
                            </strong>
                          </span>
                          <Badge tone={statusTone(status)}>{status}</Badge>
                        </span>
                        <small>
                          {orchestrationTimingLabel({
                            status,
                            completedAt: asString(workflow.completedAt),
                            updatedAt: asString(workflow.updatedAt),
                            createdAt: asString(workflow.createdAt),
                          })}
                        </small>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="orchestration-pane-heading runs-heading">
                <span>Runs</span>
                <small>{visibleRuns.length}</small>
              </div>
              <div className="orchestration-workflow-list orchestration-run-list">
                {workflowDetailResource.error ? (
                  <ErrorBlock
                    error={workflowDetailResource.error}
                    retry={workflowDetailResource.reload}
                  />
                ) : workflowDetailResource.loading ? (
                  <LoadingBlock />
                ) : visibleRuns.length === 0 ? (
                  <SmallEmpty>No runs in this workflow.</SmallEmpty>
                ) : (
                  visibleRuns.map((run) => {
                    const status = asString(run.status, "pending");
                    const tier = orchestrationStatusTier(status);
                    return (
                      <button
                        key={run.id}
                        type="button"
                        className={
                          selectedRun?.id === run.id
                            ? `selected tier-${tier}`
                            : `tier-${tier}`
                        }
                        aria-pressed={selectedRun?.id === run.id}
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        <span className="master-row master-row-top">
                          <span className="master-title-line">
                            <i
                              className="master-status-dot"
                              aria-hidden="true"
                            />
                            <strong>{asString(run.phase, run.kind)}</strong>
                          </span>
                          <Badge tone={statusTone(status)}>{status}</Badge>
                        </span>
                        <small>
                          {orchestrationTimingLabel({
                            status,
                            completedAt: asString(run.completedAt),
                            updatedAt: asString(run.updatedAt),
                            createdAt: asString(run.createdAt),
                          })}
                        </small>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <article className="orchestration-detail orchestration-run-detail">
              {!selectedWorkflow ? (
                <EmptyBlock title="Choose a workflow">
                  Workflow and run evidence appear here.
                </EmptyBlock>
              ) : (
                <>
                  <div className="orchestration-detail-header">
                    <div>
                      <span className="detail-kicker">
                        {asString(selectedWorkflow.kind, "generate")} workflow
                      </span>
                      <h2>
                        {asString(
                          workflowDetailResource.data?.workflow?.title,
                          asString(selectedWorkflow.title, selectedWorkflow.id),
                        )}
                      </h2>
                      <p>
                        {asString(
                          workflowDetailResource.data?.workflow?.objective,
                          asString(
                            selectedWorkflow.objective,
                            "No objective recorded.",
                          ),
                        )}
                      </p>
                    </div>
                    <Badge
                      tone={statusTone(
                        asString(selectedWorkflow.status, "pending"),
                      )}
                    >
                      {asString(selectedWorkflow.status, "pending")}
                    </Badge>
                  </div>
                  <div className="orchestration-detail-tags">
                    <DetailTag
                      tone={statusTone(
                        asString(selectedWorkflow.status, "pending"),
                      )}
                    >
                      {orchestrationTimingLabel({
                        status: asString(selectedWorkflow.status, "pending"),
                        completedAt: asString(selectedWorkflow.completedAt),
                        updatedAt: asString(selectedWorkflow.updatedAt),
                        createdAt: asString(selectedWorkflow.createdAt),
                      })}
                    </DetailTag>
                    <DetailTag>
                      {asString(selectedWorkflow.kind, "generate")}
                    </DetailTag>
                    <DetailTag>{visibleRuns.length} runs visible</DetailTag>
                    <DetailTag>
                      {asArray(workflowDetailResource.data?.tree).length} root
                      phases
                    </DetailTag>
                  </div>
                  <div className="orchestration-run-toolbar">
                    <span>
                      {asArray(workflowDetailResource.data?.tree).length} root
                      phases · {visibleRuns.length} runs
                    </span>
                    <div className="orchestration-run-actions">
                      {selectedRun &&
                      ["pending", "running"].includes(
                        asString(selectedRun.status),
                      ) ? (
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() =>
                            setConfirmedRunCancellation(selectedRun.id)
                          }
                          disabled={
                            !active ||
                            busyKeys[`codegen:${selectedRun.id}:cancel`]
                          }
                        >
                          Cancel run
                        </button>
                      ) : null}
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void loadBundle()}
                        disabled={
                          !active ||
                          (bundleLoading &&
                            bundleWorkflowId === selectedWorkflow.id)
                        }
                      >
                        {bundleLoading &&
                        bundleWorkflowId === selectedWorkflow.id
                          ? "Bundling…"
                          : "Bundle workflow"}
                      </button>
                    </div>
                  </div>

                  {selectedRun &&
                  confirmedRunCancellation === selectedRun.id ? (
                    <div
                      className="orchestration-confirm orchestration-run-confirm"
                      aria-live="polite"
                    >
                      <div>
                        <strong id="run-cancel-title">Cancel this run?</strong>
                        <span id="run-cancel-description">
                          This records a cancelled lifecycle state. The current
                          pipeline cannot guarantee that in-flight model work
                          stops immediately.
                        </span>
                      </div>
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() => void cancelCodegenRun(selectedRun)}
                        disabled={
                          !active ||
                          busyKeys[`codegen:${selectedRun.id}:cancel`]
                        }
                      >
                        {busyKeys[`codegen:${selectedRun.id}:cancel`]
                          ? "Cancelling…"
                          : "Confirm cancellation"}
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setConfirmedRunCancellation("")}
                      >
                        Keep running
                      </button>
                    </div>
                  ) : null}

                  {bundleError && bundleWorkflowId === selectedWorkflow.id ? (
                    <ErrorBlock
                      error={bundleError}
                      retry={() => void loadBundle()}
                    />
                  ) : null}
                  {bundleResult && bundleWorkflowId === selectedWorkflow.id ? (
                    <div className="orchestration-bundle-receipt">
                      <strong>Bundle ready</strong>
                      <code>
                        {asString(bundleResult.manifestPath) ||
                          asString(
                            asRecord(bundleResult.manifest).name,
                            "Manifest receipt ready",
                          )}
                      </code>
                      <span>
                        {asArray(bundleResult.runs).length} run records included
                      </span>
                    </div>
                  ) : null}

                  {!selectedRun ? (
                    <SmallEmpty>
                      Select a run to inspect its evidence.
                    </SmallEmpty>
                  ) : runDetailResource.error ? (
                    <ErrorBlock
                      error={runDetailResource.error}
                      retry={runDetailResource.reload}
                    />
                  ) : runDetailResource.loading ? (
                    <LoadingBlock />
                  ) : (
                    <div className="orchestration-run-inspector">
                      <div className="orchestration-subheading">
                        <div>
                          <span className="detail-kicker">Selected run</span>
                          <h3>
                            {asString(
                              selectedRun.phase,
                              asString(selectedRun.kind, selectedRun.id),
                            )}
                          </h3>
                        </div>
                        <Badge
                          tone={statusTone(
                            asString(selectedRun.status, "pending"),
                          )}
                        >
                          {asString(selectedRun.status, "pending")}
                        </Badge>
                      </div>
                      <div className="orchestration-detail-tags">
                        <DetailTag
                          tone={statusTone(
                            asString(selectedRun.status, "pending"),
                          )}
                        >
                          {orchestrationTimingLabel({
                            status: asString(selectedRun.status, "pending"),
                            completedAt: asString(selectedRun.completedAt),
                            updatedAt: asString(selectedRun.updatedAt),
                            createdAt: asString(selectedRun.createdAt),
                          })}
                        </DetailTag>
                        <DetailTag>
                          {asString(selectedRun.kind, "run")}
                        </DetailTag>
                        <DetailTag>
                          {selectedRun.taskId ? "task linked" : "task unlinked"}
                        </DetailTag>
                        <DetailTag>
                          {selectedRun.sessionId
                            ? "session linked"
                            : "session unlinked"}
                        </DetailTag>
                        <DetailTag>
                          {selectedRun.accountLabel || selectedRun.accountId
                            ? `account ${selectedRun.accountLabel || selectedRun.accountId}`
                            : "account not recorded"}
                        </DetailTag>
                      </div>
                      <dl className="orchestration-run-facts">
                        <DetailRow label="Run ID" value={selectedRun.id} />
                        <DetailRow
                          label="Task"
                          value={asString(selectedRun.taskId, "not linked")}
                        />
                        <DetailRow
                          label="Session"
                          value={asString(selectedRun.sessionId, "not linked")}
                        />
                        <DetailRow
                          label="Capability"
                          value={taskCapabilityLabel(
                            selectedRun.capabilityProfile,
                            selectedRun.kind,
                          )}
                        />
                        <DetailRow
                          label="Framework"
                          value={asString(
                            selectedRun.framework,
                            "not recorded",
                          )}
                        />
                        <DetailRow
                          label="Account provider"
                          value={asString(
                            selectedRun.accountProviderId,
                            "not recorded",
                          )}
                        />
                        <DetailRow
                          label="Account"
                          value={asString(
                            selectedRun.accountLabel,
                            asString(selectedRun.accountId, "not recorded"),
                          )}
                        />
                        <DetailRow
                          label="Updated"
                          value={displayTimestamp(
                            asString(selectedRun.updatedAt),
                          )}
                        />
                      </dl>
                      {selectedRun.error ? (
                        <Notice tone="bad">
                          <strong>Run error</strong>
                          <span>{selectedRun.error}</span>
                        </Notice>
                      ) : null}
                      <div className="orchestration-output-grid">
                        <section>
                          <span className="detail-kicker">Output preview</span>
                          <pre>
                            {asString(
                              selectedRun.outputPreview,
                              "No output preview recorded.",
                            )}
                          </pre>
                        </section>
                        <section>
                          <span className="detail-kicker">Request</span>
                          <pre>
                            {JSON.stringify(
                              asRecord(selectedRun.input),
                              null,
                              2,
                            )}
                          </pre>
                        </section>
                      </div>
                      <div className="orchestration-artifacts">
                        <span className="detail-kicker">Artifacts</span>
                        {runArtifacts(selectedRun).length > 0 ? (
                          <ArtifactViewer
                            artifacts={runArtifacts(selectedRun)}
                            runId={selectedRun.id}
                          />
                        ) : (
                          <SmallEmpty>No artifacts recorded.</SmallEmpty>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </article>
          </div>
        ) : null}
      </section>
    </div>
  );
}
