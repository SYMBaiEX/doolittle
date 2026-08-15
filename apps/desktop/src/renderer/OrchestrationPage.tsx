import {
  type KeyboardEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChatContextRequest } from "./chat-context-handoff";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import type { DesktopNavigationIntent } from "./desktop-navigation-intent";
import { asNumber, asRecord, asString, Notice } from "./lib";
import { AgentRosterPanel } from "./orchestration/AgentRosterPanel";
import { orchestrationClass as oc } from "./orchestration/layout";
import { compactControlValue } from "./orchestration/models";
import { PlanCreateForm } from "./orchestration/PlanCreateForm";
import { PlanPanel } from "./orchestration/PlanPanel";
import { TaskCreateForm } from "./orchestration/TaskCreateForm";
import { TaskQueuePanel } from "./orchestration/TaskQueuePanel";
import { TaskSupervisionControls } from "./orchestration/TaskSupervisionControls";
import { resolveTaskNavigationIntent } from "./orchestration/task-navigation";
import { useOrchestrationActions } from "./orchestration/useOrchestrationActions";
import {
  orchestrationStatusTier,
  projectScopedOrchestrationOverview,
  shouldShowOrchestrationSummary,
} from "./orchestration-helpers";
import { useOrchestrationResources } from "./orchestration-resources";

const OrchestrationRunsPanel = lazy(() =>
  import("./orchestration/OrchestrationRunsPanel").then((module) => ({
    default: module.OrchestrationRunsPanel,
  })),
);
const ReviewPage = lazy(() =>
  import("./ReviewPage").then((module) => ({ default: module.ReviewPage })),
);

export type WorkTabId = "tasks" | "agents" | "plans" | "runs" | "review";
export const WORK_TABS: ReadonlyArray<{ id: WorkTabId; label: string }> = [
  { id: "tasks", label: "Queue" },
  { id: "agents", label: "Agents" },
  { id: "plans", label: "Plans" },
  { id: "runs", label: "Build & research" },
  { id: "review", label: "Review" },
];

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
    <span className={oc("orchestration-summary-chip", tone)}>
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
  onOpenWorkspaceFile,
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
  onOpenWorkspaceFile?: (path: string) => void;
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
  const tabRefs = useRef<Record<WorkTabId, HTMLButtonElement | null>>({
    tasks: null,
    agents: null,
    plans: null,
    runs: null,
    review: null,
  });
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
    taskDetailResource,
    workersResource,
    plansResource,
    worktreesResource,
    codegenRuntimeResource,
    codegenRunsResource,
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
    selectedTaskDetail,
    refreshAll,
    refreshCodegen,
    refreshDelegation,
  } = useOrchestrationResources({
    active,
    activeTab,
    selectedWorkflowId,
    selectedRunId,
    selectedTaskId,
    projectScope,
    workspacePath,
    platform: window.doolittle.platform,
  });

  const statusResources = useMemo(() => {
    const entries = [
      { label: "orchestration overview", resource: overviewResource },
      { label: "plans", resource: plansResource },
      {
        label: "account pool",
        resource: accountPoolResource,
        required: false,
      },
      {
        label: "task queue",
        resource: tasksResource,
        required: activeTab === "tasks",
      },
      {
        label: "agent roster",
        resource: workersResource,
        required: activeTab === "agents",
      },
      {
        label: "worktrees",
        resource: worktreesResource,
        required: false,
      },
      {
        label: "codegen runtime",
        resource: codegenRuntimeResource,
        required: activeTab === "runs",
      },
      {
        label: "codegen workflows",
        resource: codegenWorkflowsResource,
        required: activeTab === "runs",
      },
      {
        label: "codegen runs",
        resource: codegenRunsResource,
        required: activeTab === "runs",
      },
      {
        label: "workflow detail",
        resource: workflowDetailResource,
        required: false,
      },
      { label: "task detail", resource: taskDetailResource, required: false },
      { label: "run detail", resource: runDetailResource, required: false },
    ];
    return entries.filter((entry) => entry.resource.status !== "disabled");
  }, [
    activeTab,
    accountPoolResource,
    codegenRuntimeResource,
    codegenWorkflowsResource,
    overviewResource,
    plansResource,
    runDetailResource,
    tasksResource,
    taskDetailResource,
    workersResource,
    workflowDetailResource,
    codegenRunsResource,
    worktreesResource,
  ]);

  const selectedTaskSummary =
    tasks.find((entry) => asString(entry.id) === selectedTaskId) ?? tasks[0];
  const selectedTask =
    selectedTaskDetail?.id === selectedTaskSummary?.id
      ? selectedTaskDetail
      : selectedTaskSummary;
  const selectedWorker =
    workers.find((entry) => asString(entry.id) === selectedWorkerId) ??
    workers[0];
  const selectedPlan =
    plans.find((entry) => asString(entry.id) === selectedPlanId) ?? plans[0];
  const { selectedWorkflow, selectedRun, visibleRuns } = codegenSelection;

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

  const overview = asRecord(overviewResource.data?.overview);
  const nativeOverview = asRecord(overview.native);
  const localOverview = asRecord(overview.local);
  const globalOverview =
    Object.keys(nativeOverview).length > 0 ? nativeOverview : localOverview;
  const effectiveOverview = projectScopedOrchestrationOverview({
    projectScope,
    tasks,
    globalOverview,
  });
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
  const linkedPlanTask = selectedPlan?.taskId
    ? tasks.find((task) => task.id === selectedPlan.taskId)
    : undefined;
  const planCanSteer =
    asString(selectedPlan?.status) === "active" &&
    Boolean(linkedPlanTask) &&
    asString(linkedPlanTask?.status) === "pending";

  const {
    approvePlan,
    availableTaskCreateWorktrees,
    bundleError,
    bundleLoading,
    bundleResult,
    bundleWorkflowId,
    busyKeys,
    cancelCodegenRun,
    cascadeChildren,
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
    publishNotice,
    requestDestructiveTaskAction,
    runSupervise,
    runTaskAction,
    selectWorkflow,
    selectedTaskNote,
    setCascadeChildren,
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
  } = useOrchestrationActions({
    active,
    codegenExecution,
    codegenReady,
    onSelectPlan: setSelectedPlanId,
    onSelectRun: setSelectedRunId,
    onSelectTask: setSelectedTaskId,
    onSelectWorkflow: setSelectedWorkflowId,
    planCanSteer,
    planningControl,
    platform: window.doolittle.platform,
    recommendedPooledFramework,
    refreshCodegen,
    refreshDelegation,
    reloadPlans: plansResource.reload,
    selectedPlan,
    selectedRun,
    selectedTask,
    selectedWorkflow,
    supportsPlanCreate,
    workspaceLabel,
    workspacePath,
    worktrees,
  });

  useEffect(() => {
    if (navigationIntent?.kind !== "orchestration-task" || !active) return;
    if (consumedNavigationIntents.current.has(navigationIntent.id)) {
      onAcknowledgeNavigationIntent(navigationIntent.id);
      return;
    }
    const resolution = resolveTaskNavigationIntent({
      taskId: navigationIntent.target.taskId,
      loading: tasksResource.loading,
      error: tasksResource.error,
      tasks,
    });
    if (resolution.kind === "wait") return;
    if (resolution.kind === "missing") {
      consumedNavigationIntents.current.add(navigationIntent.id);
      publishNotice({
        tone: "warn",
        message: "That task is no longer available in the selected workspace.",
      });
      onAcknowledgeNavigationIntent(navigationIntent.id);
      return;
    }
    consumedNavigationIntents.current.add(navigationIntent.id);
    setActiveTab("tasks");
    setSelectedTaskId(resolution.taskId);
    onAcknowledgeNavigationIntent(navigationIntent.id);
  }, [
    active,
    navigationIntent,
    onAcknowledgeNavigationIntent,
    publishNotice,
    tasks,
    tasksResource.error,
    tasksResource.loading,
  ]);

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
  const queuedCount = asNumber(effectiveOverview.pending);
  const runningCount = Math.max(
    asNumber(effectiveOverview.running),
    projectScope === "all" ? workerActiveCount : 0,
  );
  const showHeaderSummary = shouldShowOrchestrationSummary({
    queued: queuedCount,
    running: runningCount,
    approval: approvalCount,
    completed: completedCount,
  });

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

  return (
    <div className={oc("orchestration-page")}>
      <header className={oc("orchestration-header")}>
        <div>
          <h1>Agent work</h1>
          <p>
            Tasks, active runs, and completed changes
            {projectScope === "all"
              ? " across every project."
              : ` for ${workspaceLabel || "the selected project"}.`}
          </p>
        </div>
        <div className={oc("orchestration-header-metrics")}>
          {showHeaderSummary ? (
            <>
              <SummaryChip label="Queued" value={queuedCount} tone="neutral" />
              <SummaryChip label="Running" value={runningCount} tone="warn" />
              <SummaryChip label="Approval" value={approvalCount} tone="warn" />
              <SummaryChip
                label="Completed"
                value={completedCount}
                tone="good"
              />
            </>
          ) : null}
          <button
            className={oc("icon-button", "orchestration-refresh")}
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

      <ResourceStatusBar resources={statusResources} />

      {notices.length > 0 ? (
        <div aria-live="polite" className={oc("orchestration-notices")}>
          {notices.slice(-1).map((entry) => (
            <Notice key={entry.id} tone={entry.tone}>
              <strong>{entry.message}</strong>
              {entry.details ? <span>{entry.details}</span> : null}
            </Notice>
          ))}
        </div>
      ) : null}

      <div className={oc("orchestration-nav-row")}>
        <div
          role="tablist"
          aria-label="Orchestration sections"
          className={oc("orchestration-tabs")}
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
              className={oc(entry.id === activeTab && "selected")}
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
              {entry.id === "tasks" && tasks.length > 0 ? (
                <span>{tasks.length}</span>
              ) : null}
              {entry.id === "agents" && workers.length > 0 ? (
                <span>{workers.length}</span>
              ) : null}
              {entry.id === "plans" && plans.length > 0 ? (
                <span>{plans.length}</span>
              ) : null}
              {entry.id === "runs" && runs.length > 0 ? (
                <span>{runs.length}</span>
              ) : null}
              {entry.id === "review" && approvalCount > 0 ? (
                <span>{approvalCount}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className={oc("orchestration-command-bar")}>
          {activeTab === "tasks" ? (
            <>
              {tasks.length > 0 ? (
                <TaskSupervisionControls
                  active={active}
                  busy={Boolean(busyKeys["task:supervise"])}
                  concurrency={superviseConcurrency}
                  onConcurrencyChange={setSuperviseConcurrency}
                  onSupervise={runSupervise}
                />
              ) : null}
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
        className={oc("orchestration-panel")}
      >
        {activeTab === "review" ? (
          <Suspense
            fallback={
              <div
                aria-live="polite"
                className={oc("orchestration-loading")}
                role="status"
              >
                Loading review tools…
              </div>
            }
          >
            <ReviewPage
              active={active}
              embedded
              onOpenWorkspaceFile={onOpenWorkspaceFile}
              onSendToChat={onSendToChat}
              projectScope={projectScope}
              workspacePath={workspacePath ?? ""}
            />
          </Suspense>
        ) : null}
        {activeTab === "tasks" ? (
          <TaskQueuePanel
            active={active}
            projectScope={projectScope}
            workspaceLabel={workspaceLabel}
            effectiveOverview={effectiveOverview}
            tasksResource={tasksResource}
            taskDetailReady={selectedTaskDetail?.id === selectedTask?.id}
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
          <Suspense
            fallback={
              <div
                aria-live="polite"
                className={oc("orchestration-loading")}
                role="status"
              >
                Loading workflow tools…
              </div>
            }
          >
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
              onSelectWorkflow={selectWorkflow}
              onSelectRun={setSelectedRunId}
              onRequestRunCancellation={setConfirmedRunCancellation}
              onDismissRunCancellation={() => setConfirmedRunCancellation("")}
              onLoadBundle={loadBundle}
              onCancelRun={cancelCodegenRun}
            />
          </Suspense>
        ) : null}
      </section>
    </div>
  );
}
