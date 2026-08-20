import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  asRecord,
  asString,
  desktopRequest,
  errorMessage,
  type UnknownRecord,
} from "../lib";
import {
  type TaskCapability,
  taskCreatePayload,
  taskSpawnPayload,
} from "../orchestration-helpers";
import {
  type CodegenCancellationResponse,
  type CodegenRunRecord,
  type CodegenWorkflowRecord,
  type DelegationTaskRecord,
  isolatedCodingWorktrees,
  orchestrationResourceId,
  type PlanRecord,
  type RepositoryWorktreeRecord,
  type WorkflowBundleResponse,
} from "../orchestration-resources";
import type { DesktopPlatform } from "../workspace-path";
import {
  type BulkTaskAction,
  type ConfirmedAction,
  compactStatus,
  type NoticeKind,
  type PlanStatus,
  type SurfaceNotice,
  type TaskAction,
  type TaskCreatePriority,
} from "./models";
import { CODEGEN_MODES, type CodegenMode } from "./orchestration-runs-model";

async function postJson<T>(path: string, body: UnknownRecord): Promise<T> {
  return desktopRequest<T>(
    path as Parameters<typeof desktopRequest<T>>[0],
    "POST",
    body,
  );
}

export function updateBusyKeys(
  current: Readonly<Record<string, boolean>>,
  key: string,
  busy: boolean,
): Record<string, boolean> {
  if (busy) return { ...current, [key]: true };
  const next = { ...current };
  delete next[key];
  return next;
}

export function appendSurfaceNotice(
  current: readonly SurfaceNotice[],
  notice: SurfaceNotice,
): SurfaceNotice[] {
  return [...current.slice(-2), notice];
}

export function parseSupervisionConcurrency(value: string): number | undefined {
  const concurrency = Number(value);
  return Number.isFinite(concurrency) && concurrency > 0
    ? concurrency
    : undefined;
}

export function codegenRequestBody({
  mode,
  projectName,
  projectPath,
  prompt,
  targetType,
}: {
  mode: CodegenMode;
  projectName: string;
  projectPath: string;
  prompt: string;
  targetType: string;
}): UnknownRecord {
  if (mode === "qa") return { projectPath: projectPath.trim() };
  if (mode === "generate") {
    return { projectName: projectName.trim(), prompt: prompt.trim() };
  }
  return {
    projectName: projectName.trim(),
    description: prompt.trim(),
    targetType: targetType.trim() || "plugin",
  };
}

export type UseOrchestrationActionsOptions = {
  active: boolean;
  codegenExecution: UnknownRecord;
  codegenReady: boolean;
  planCanSteer: boolean;
  planningControl: UnknownRecord;
  platform: DesktopPlatform;
  recommendedPooledFramework: string;
  selectedPlan?: PlanRecord;
  selectedRun?: CodegenRunRecord;
  selectedTask?: DelegationTaskRecord;
  selectedWorkflow?: CodegenWorkflowRecord;
  supportsPlanCreate: boolean;
  workspaceLabel?: string;
  workspacePath?: string;
  worktrees: readonly RepositoryWorktreeRecord[];
  onSelectPlan: (id: string) => void;
  onSelectRun: (id: string) => void;
  onSelectTask: (id: string) => void;
  onSelectWorkflow: (id: string) => void;
  refreshCodegen: () => void;
  refreshDelegation: () => void;
  reloadPlans: () => void;
};

export function useOrchestrationActions({
  active,
  codegenExecution,
  codegenReady,
  onSelectPlan,
  onSelectRun,
  onSelectTask,
  onSelectWorkflow,
  planCanSteer,
  planningControl,
  platform,
  recommendedPooledFramework,
  refreshCodegen,
  refreshDelegation,
  reloadPlans,
  selectedPlan,
  selectedRun,
  selectedTask,
  selectedWorkflow,
  supportsPlanCreate,
  workspaceLabel,
  workspacePath,
  worktrees,
}: UseOrchestrationActionsOptions) {
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
  const [childTitle, setChildTitle] = useState("");
  const [childObjective, setChildObjective] = useState("");
  const [childWorkspaceRoot, setChildWorkspaceRoot] = useState("");
  const [superviseConcurrency, setSuperviseConcurrency] = useState("3");
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
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
  const [bundleWorkflowId, setBundleWorkflowId] = useState("");
  const [bundleResult, setBundleResult] =
    useState<WorkflowBundleResponse | null>(null);
  const [bundleError, setBundleError] = useState("");
  const [bundleLoading, setBundleLoading] = useState(false);
  const [confirmedRunCancellation, setConfirmedRunCancellation] = useState("");
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const confirmReturnRef = useRef<HTMLButtonElement | null>(null);
  const guidedCodingLaunchId = useRef("");

  const availableTaskCreateWorktrees =
    taskCreateCapability === "coding"
      ? isolatedCodingWorktrees(worktrees, workspacePath, platform)
      : worktrees;
  const selectedTaskCreateWorktree = availableTaskCreateWorktrees.find(
    (worktree) => worktree.path === taskCreateWorkspaceRoot,
  );
  const selectedTaskNote = selectedTask
    ? (taskNotes[selectedTask.id] ?? "")
    : "";

  useEffect(() => {
    if (!workspacePath?.trim()) return;
    setCodegenProjectPath((current) => current || workspacePath);
    setCodegenProjectName(
      (current) => current || workspaceLabel || "workspace",
    );
  }, [workspaceLabel, workspacePath]);

  useEffect(() => {
    if (
      confirmedRunCancellation &&
      confirmedRunCancellation !== selectedRun?.id
    ) {
      setConfirmedRunCancellation("");
    }
  }, [confirmedRunCancellation, selectedRun?.id]);

  useEffect(() => {
    if (!confirmedAction) return;
    requestAnimationFrame(() => confirmDialogRef.current?.focus());
  }, [confirmedAction]);

  const publishNotice = useCallback(
    ({
      tone,
      message,
      details,
    }: {
      tone: NoticeKind;
      message: string;
      details?: string;
    }) => {
      setNotices((current) =>
        appendSurfaceNotice(current, {
          id: Date.now(),
          tone,
          message,
          details,
        }),
      );
    },
    [],
  );

  const runBusy = (key: string, next: boolean) => {
    setBusyKeys((current) => updateBusyKeys(current, key, next));
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
      if (nextId) onSelectTask(nextId);
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
      if (childId) onSelectTask(childId);
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

  const runBulkTaskAction = async (
    tasks: readonly DelegationTaskRecord[],
    action: BulkTaskAction,
  ) => {
    if (!active || tasks.length === 0) return;
    const key = `task:bulk:${action}`;
    runBusy(key, true);
    try {
      const result = await postJson<{
        failed: number;
        requested: number;
        succeeded: number;
      }>("/delegation/tasks/bulk", {
        action,
        ids: tasks.map((task) => task.id),
      });
      publishNotice({
        tone: result.failed > 0 ? "warn" : "good",
        message: `${compactStatus(action)} applied to ${result.succeeded} task${result.succeeded === 1 ? "" : "s"}.`,
        details:
          result.failed > 0
            ? `${result.failed} of ${result.requested} tasks could not be updated.`
            : undefined,
      });
      refreshDelegation();
    } catch (error) {
      publishNotice({
        tone: "bad",
        message: `Bulk ${compactStatus(action)} failed.`,
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

  const runSupervise = async () => {
    const key = "task:supervise";
    runBusy(key, true);
    try {
      await postJson<UnknownRecord>("/delegation/supervise", {
        concurrency: parseSupervisionConcurrency(superviseConcurrency),
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
      if (nextId) onSelectPlan(nextId);
      setPlanTitle("");
      setPlanObjective("");
      setPlanTaskId("");
      setPlanWorkflowId("");
      setShowPlanCreate(false);
      publishNotice({ tone: "good", message: "Plan created." });
      reloadPlans();
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
      reloadPlans();
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
        { instruction: planSteerInstruction.trim() },
      );
      setPlanSteerInstruction("");
      publishNotice({
        tone: "good",
        message: "Operator steering recorded.",
        details:
          "The instruction will enter the linked task on its next execution or retry.",
      });
      reloadPlans();
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
      const body = codegenRequestBody({
        mode: codegenMode,
        projectName: codegenProjectName,
        projectPath: codegenProjectPath,
        prompt: codegenPrompt,
        targetType: codegenTargetType,
      });
      const result = await postJson<UnknownRecord>(
        `/codegen/${codegenMode}`,
        body,
      );
      const nextWorkflowId = asString(result.workflowId);
      const nextRun = asRecord(
        result.run ?? result.prdRun ?? result.researchRun,
      );
      if (nextWorkflowId) onSelectWorkflow(nextWorkflowId);
      if (asString(nextRun.id)) onSelectRun(asString(nextRun.id));
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
      setBundleResult(
        await postJson<WorkflowBundleResponse>(
          `/codegen/workflows/${orchestrationResourceId(workflowId)}/bundle`,
          {},
        ),
      );
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

  const openTaskCreate = (capability: TaskCapability) => {
    setTaskCreateCapability(capability);
    setTaskCreateFramework((current) => current || recommendedPooledFramework);
    setTaskCreateWorkspaceRoot((current) =>
      capability === "coding" ? "" : current || workspacePath || "",
    );
    setShowTaskCreate(true);
  };

  const selectWorkflow = (workflowId: string) => {
    onSelectWorkflow(workflowId);
    onSelectRun("");
    setBundleWorkflowId("");
    setBundleResult(null);
    setBundleError("");
  };

  return {
    approvePlan,
    availableTaskCreateWorktrees,
    bundleError,
    bundleLoading,
    bundleResult,
    bundleWorkflowId,
    busyKeys,
    cancelCodegenRun,
    childObjective,
    childTitle,
    childWorkspaceRoot,
    closeTaskConfirmation,
    codegenMode,
    codegenProjectName,
    codegenProjectPath,
    codegenPrompt,
    codegenTargetType,
    confirmedAction,
    confirmedRunCancellation,
    confirmDialogRef,
    loadBundle,
    notices,
    publishNotice,
    onSubmitCodegen,
    onSubmitCreatePlan,
    onSubmitCreateTask,
    onSubmitSpawn,
    openTaskCreate,
    planObjective,
    planStatus,
    planSteerInstruction,
    planTaskId,
    planTitle,
    planWorkflowId,
    requestDestructiveTaskAction,
    runSupervise,
    runBulkTaskAction,
    runTaskAction,
    selectWorkflow,
    selectedTaskNote,
    setChildObjective,
    setChildTitle,
    setChildWorkspaceRoot,
    setCodegenMode,
    setCodegenProjectName,
    setCodegenProjectPath,
    setCodegenPrompt,
    setCodegenTargetType,
    setConfirmedAction,
    setConfirmedRunCancellation,
    setPlanObjective,
    setPlanStatus,
    setPlanSteerInstruction,
    setPlanTaskId,
    setPlanTitle,
    setPlanWorkflowId,
    setShowChildCreate,
    setShowPlanCreate,
    setShowTaskCreate,
    setSuperviseConcurrency,
    setTaskCreateCapability,
    setTaskCreateFramework,
    setTaskCreateGroup,
    setTaskCreateObjective,
    setTaskCreatePriority,
    setTaskCreateTitle,
    setTaskCreateWorkspaceRoot,
    setTaskNotes,
    showChildCreate,
    showPlanCreate,
    showTaskCreate,
    steerPlan,
    superviseConcurrency,
    taskCreateCapability,
    taskCreateFramework,
    taskCreateGroup,
    taskCreateObjective,
    taskCreatePriority,
    taskCreateTitle,
    taskCreateWorkspaceRoot,
  };
}
