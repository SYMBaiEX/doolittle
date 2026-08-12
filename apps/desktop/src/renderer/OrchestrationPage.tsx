import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChatContextRequest } from "./chat-context-handoff";
import type { DesktopNavigationIntent } from "./desktop-navigation-intent";
import {
  asNumber,
  asRecord,
  asString,
  desktopRequest,
  errorMessage,
  Notice,
  type UnknownRecord,
} from "./lib";
import { AgentRosterPanel } from "./orchestration/AgentRosterPanel";
import type {
  ConfirmedAction,
  NoticeKind,
  PlanStatus,
  SurfaceNotice,
  TaskAction,
  TaskCreatePriority,
} from "./orchestration/models";
import { compactControlValue, compactStatus } from "./orchestration/models";
import { OrchestrationRunsPanel } from "./orchestration/OrchestrationRunsPanel";
import {
  CODEGEN_MODES,
  type CodegenMode,
} from "./orchestration/orchestration-runs-model";
import { PlanCreateForm } from "./orchestration/PlanCreateForm";
import { PlanPanel } from "./orchestration/PlanPanel";
import { TaskCreateForm } from "./orchestration/TaskCreateForm";
import { TaskQueuePanel } from "./orchestration/TaskQueuePanel";
import {
  orchestrationStatusTier,
  type TaskCapability,
  taskCreatePayload,
  taskSpawnPayload,
} from "./orchestration-helpers";
import {
  type CodegenCancellationResponse,
  type CodegenRunRecord,
  type DelegationTaskRecord,
  isolatedCodingWorktrees,
  orchestrationResourceId,
  type PlanRecord,
  useOrchestrationResources,
  type WorkflowBundleResponse,
} from "./orchestration-resources";
import { ReviewPage } from "./ReviewPage";
import "./orchestration.css";

export type WorkTabId = "tasks" | "agents" | "plans" | "runs" | "review";
export const WORK_TABS: ReadonlyArray<{ id: WorkTabId; label: string }> = [
  { id: "tasks", label: "Queue" },
  { id: "agents", label: "Agents" },
  { id: "plans", label: "Plans" },
  { id: "runs", label: "Build & research" },
  { id: "review", label: "Review" },
];

async function postJson<T>(path: string, body: UnknownRecord): Promise<T> {
  return desktopRequest<T>(
    path as Parameters<typeof desktopRequest<T>>[0],
    "POST",
    body,
  );
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

  const {
    overviewResource,
    tasksResource,
    workersResource,
    plansResource,
    codegenRuntimeResource,
    accountPoolResource,
    codegenWorkflowsResource,
    workflowDetailResource,
    runDetailResource,
    tasks,
    workers,
    worktrees,
    plans,
    workflows,
    runs,
    codegenSelection,
    refreshAll,
    refreshCodegen,
    refreshDelegation,
  } = useOrchestrationResources({
    active,
    activeTab,
    selectedWorkflowId,
    selectedRunId,
    projectScope,
    workspacePath,
    platform: window.doolittle.platform,
  });

  const selectedTask =
    tasks.find((entry) => asString(entry.id) === selectedTaskId) ?? tasks[0];
  const selectedWorker =
    workers.find((entry) => asString(entry.id) === selectedWorkerId) ??
    workers[0];
  const selectedPlan =
    plans.find((entry) => asString(entry.id) === selectedPlanId) ?? plans[0];
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
  const [taskCreatePriority, setTaskCreatePriority] =
    useState<TaskCreatePriority>("");
  const [taskCreateWorkspaceRoot, setTaskCreateWorkspaceRoot] = useState("");
  const availableTaskCreateWorktrees =
    taskCreateCapability === "coding"
      ? isolatedCodingWorktrees(
          worktrees,
          workspacePath,
          window.doolittle.platform,
        )
      : worktrees;
  const selectedTaskCreateWorktree = availableTaskCreateWorktrees.find(
    (worktree) => worktree.path === taskCreateWorkspaceRoot,
  );
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
  const [planStatus, setPlanStatus] = useState<PlanStatus>("draft");
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
  const guidedCodingLaunchId = useRef("");

  useEffect(() => {
    if (!workspacePath?.trim()) return;
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

  const onSubmitCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskCreateTitle.trim() || !taskCreateObjective.trim()) {
      publishNotice({
        tone: "bad",
        message: "Title and objective are required.",
      });
      return;
    }
    const startsCoding = taskCreateCapability === "coding";
    if (startsCoding && !selectedTaskCreateWorktree?.branch) {
      publishNotice({
        tone: "bad",
        message: "Choose an active branch worktree before starting coding.",
      });
      return;
    }
    const key = "task:create";
    runBusy(key, true);
    try {
      const payload = taskCreatePayload({
        title: taskCreateTitle,
        objective: taskCreateObjective,
        capability: taskCreateCapability,
        framework: taskCreateFramework,
        group: taskCreateGroup,
        priority: taskCreatePriority,
        workspaceRoot: taskCreateWorkspaceRoot,
      });
      if (startsCoding && !guidedCodingLaunchId.current) {
        guidedCodingLaunchId.current = crypto.randomUUID();
      }
      let nextId = "";
      if (startsCoding) {
        const result = await postJson<{
          launch?: { task?: DelegationTaskRecord; review?: { tab?: string } };
        }>("/delegation/tasks/start-coding", {
          ...payload,
          branch: selectedTaskCreateWorktree?.branch,
          launchId: guidedCodingLaunchId.current,
        });
        nextId = asString(result.launch?.task?.id);
      } else {
        const result = await postJson<{ task?: DelegationTaskRecord }>(
          "/delegation/tasks",
          payload,
        );
        nextId = asString(result.task?.id);
      }
      if (nextId) setSelectedTaskId(nextId);
      setTaskCreateTitle("");
      setTaskCreateObjective("");
      setTaskCreateFramework("");
      setTaskCreateGroup("");
      setTaskCreatePriority("");
      setTaskCreateWorkspaceRoot("");
      guidedCodingLaunchId.current = "";
      setShowTaskCreate(false);
      publishNotice({
        tone: "good",
        message: startsCoding
          ? "Coding session started. Follow its output in Queue; review is ready in the Review tab."
          : "Task created.",
      });
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
        `/delegation/tasks/${orchestrationResourceId(selectedTask.id)}/spawn`,
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
        `/delegation/tasks/${orchestrationResourceId(task.id)}/${action}`,
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
        `/plans/${orchestrationResourceId(plan.id)}/approve`,
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
        `/plans/${orchestrationResourceId(selectedPlan.id)}/steer`,
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
        `/codegen/workflows/${orchestrationResourceId(workflowId)}/bundle`,
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
        `/codegen/runs/${orchestrationResourceId(run.id)}/cancel`,
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
    setTaskCreateWorkspaceRoot((current) =>
      capability === "coding" ? "" : current || workspacePath || "",
    );
    setShowTaskCreate(true);
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
        <TaskCreateForm
          active={active}
          busy={Boolean(busyKeys["task:create"])}
          title={taskCreateTitle}
          objective={taskCreateObjective}
          capability={taskCreateCapability}
          framework={taskCreateFramework}
          group={taskCreateGroup}
          priority={taskCreatePriority}
          workspaceRoot={taskCreateWorkspaceRoot}
          availableWorktrees={availableTaskCreateWorktrees}
          accountPoolResource={accountPoolResource}
          onTitleChange={setTaskCreateTitle}
          onObjectiveChange={setTaskCreateObjective}
          onCapabilityChange={setTaskCreateCapability}
          onFrameworkChange={setTaskCreateFramework}
          onGroupChange={setTaskCreateGroup}
          onPriorityChange={setTaskCreatePriority}
          onWorkspaceRootChange={setTaskCreateWorkspaceRoot}
          onSubmit={onSubmitCreateTask}
          onClose={() => setShowTaskCreate(false)}
        />
      ) : null}

      {activeTab === "plans" && showPlanCreate ? (
        <PlanCreateForm
          active={active}
          busy={Boolean(busyKeys["plan:create"])}
          supportsCreate={supportsPlanCreate}
          title={planTitle}
          objective={planObjective}
          status={planStatus}
          taskId={planTaskId}
          workflowId={planWorkflowId}
          onTitleChange={setPlanTitle}
          onObjectiveChange={setPlanObjective}
          onStatusChange={setPlanStatus}
          onTaskIdChange={setPlanTaskId}
          onWorkflowIdChange={setPlanWorkflowId}
          onSubmit={onSubmitCreatePlan}
          onClose={() => setShowPlanCreate(false)}
        />
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
        ) : null}
        {activeTab === "tasks" ? (
          <TaskQueuePanel
            active={active}
            projectScope={projectScope}
            workspaceLabel={workspaceLabel}
            effectiveOverview={effectiveOverview}
            tasksResource={tasksResource}
            tasks={tasks}
            selectedTask={selectedTask}
            busyKeys={busyKeys}
            selectedTaskNote={selectedTaskNote}
            showChildCreate={showChildCreate}
            childTitle={childTitle}
            childObjective={childObjective}
            childWorkspaceRoot={childWorkspaceRoot}
            worktrees={worktrees}
            confirmedAction={confirmedAction}
            cascadeChildren={cascadeChildren}
            confirmDialogRef={confirmDialogRef}
            onSelectTask={(task) => {
              setSelectedTaskId(task.id);
              setConfirmedAction(null);
              setShowChildCreate(false);
            }}
            onRunTaskAction={runTaskAction}
            onRequestDestructiveAction={requestDestructiveTaskAction}
            onCloseConfirmation={closeTaskConfirmation}
            onCascadeChildrenChange={setCascadeChildren}
            onToggleChildCreate={(task) =>
              setShowChildCreate((current) => {
                const next = !current;
                if (next) setChildWorkspaceRoot(asString(task.workspaceRoot));
                return next;
              })
            }
            onChildTitleChange={setChildTitle}
            onChildObjectiveChange={setChildObjective}
            onChildWorkspaceRootChange={setChildWorkspaceRoot}
            onSubmitSpawn={onSubmitSpawn}
            onTaskNoteChange={(value, taskId) =>
              setTaskNotes((current) => ({ ...current, [taskId]: value }))
            }
            onSubmitNote={(event) => {
              event.preventDefault();
              if (selectedTask) void runTaskAction(selectedTask, "note");
            }}
          />
        ) : null}
        {activeTab === "agents" ? (
          <AgentRosterPanel
            workersResource={workersResource}
            workers={workers}
            workerOverview={workerOverview}
            selectedWorker={selectedWorker}
            onSelectWorker={(worker) => setSelectedWorkerId(worker.id)}
          />
        ) : null}
        {activeTab === "plans" ? (
          <PlanPanel
            active={active}
            plansResource={plansResource}
            plans={plans}
            selectedPlan={selectedPlan}
            linkedPlanTask={linkedPlanTask}
            planCanSteer={planCanSteer}
            planMetaLines={planMetaLines}
            busyKeys={busyKeys}
            planSteerInstruction={planSteerInstruction}
            onSelectPlan={(plan) => setSelectedPlanId(plan.id)}
            onApprovePlan={approvePlan}
            onSteerPlan={steerPlan}
            onPlanSteerInstructionChange={setPlanSteerInstruction}
          />
        ) : null}
        {activeTab === "runs" ? (
          <OrchestrationRunsPanel
            active={active}
            workspaceLabel={workspaceLabel}
            workspacePath={workspacePath}
            codegenRuntimeResource={codegenRuntimeResource}
            codegenWorkflowsResource={codegenWorkflowsResource}
            workflowDetailResource={workflowDetailResource}
            runDetailResource={runDetailResource}
            codegenExecution={codegenExecution}
            codegenAvailable={codegenAvailable}
            codegenReady={codegenReady}
            workflowSummary={workflowSummary}
            codegenMode={codegenMode}
            codegenProjectName={codegenProjectName}
            codegenPrompt={codegenPrompt}
            codegenProjectPath={codegenProjectPath}
            codegenTargetType={codegenTargetType}
            busyKeys={busyKeys}
            workflows={workflows}
            visibleRuns={visibleRuns}
            selectedWorkflow={selectedWorkflow}
            selectedRun={selectedRun}
            bundleWorkflowId={bundleWorkflowId}
            bundleResult={bundleResult}
            bundleError={bundleError}
            bundleLoading={bundleLoading}
            confirmedRunCancellation={confirmedRunCancellation}
            onCodegenModeChange={setCodegenMode}
            onCodegenProjectNameChange={setCodegenProjectName}
            onCodegenPromptChange={setCodegenPrompt}
            onCodegenProjectPathChange={setCodegenProjectPath}
            onCodegenTargetTypeChange={setCodegenTargetType}
            onSubmitCodegen={onSubmitCodegen}
            onSelectWorkflow={(workflowId) => {
              setSelectedWorkflowId(workflowId);
              setSelectedRunId("");
              setBundleWorkflowId("");
              setBundleResult(null);
              setBundleError("");
            }}
            onSelectRun={setSelectedRunId}
            onRequestRunCancellation={setConfirmedRunCancellation}
            onDismissRunCancellation={() => setConfirmedRunCancellation("")}
            onLoadBundle={loadBundle}
            onCancelRun={cancelCodegenRun}
          />
        ) : null}
      </section>
    </div>
  );
}
