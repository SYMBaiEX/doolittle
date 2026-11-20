import { RefreshCw } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { OrchestrationFocusState } from "./app-shell/route-focus-state";
import { ICON_BUTTON_CLASS } from "./app-shell/shell-layout";
import type { ChatContextRequest } from "./chat-context-handoff";
import { PanelTabs } from "./components/PanelTabs";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import { UiIcon } from "./components/UiIcon";
import type { ComputerOrigin } from "./computer-origin";
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
import {
  type ResourceStatusItem,
  summarizeResourceStatuses,
} from "./resource-status";

const OrchestrationRunsPanel = lazy(() =>
  import("./orchestration/OrchestrationRunsPanel").then((module) => ({
    default: module.OrchestrationRunsPanel,
  })),
);
const ReviewPage = lazy(() =>
  import("./ReviewPage").then((module) => ({ default: module.ReviewPage })),
);
const AutomationsPage = lazy(() =>
  import("./AutomationsPage").then((module) => ({
    default: module.AutomationsPage,
  })),
);
const GatewayPage = lazy(() =>
  import("./GatewayPage").then((module) => ({ default: module.GatewayPage })),
);
const TeamManagementPanel = lazy(() =>
  import("./bots/TeamManagementPanel").then((module) => ({
    default: module.TeamManagementPanel,
  })),
);

const WORK_TABS = [
  { id: "tasks", label: "Queue" },
  { id: "runs", label: "Runs" },
  { id: "review", label: "Review" },
  { id: "automations", label: "Automations" },
  { id: "agents", label: "Agents" },
  { id: "plans", label: "Plans" },
  { id: "inbox", label: "Inbox" },
] as const;

export type WorkTabId = (typeof WORK_TABS)[number]["id"];
type LocalWorkTab = "tasks" | "runs" | "plans";
export type LinkedWorkTab = Exclude<WorkTabId, LocalWorkTab>;

/** Keep healthy runtime plumbing out of the task workspace; surface only work. */
export function shouldShowWorkResourceStatus(
  resources: readonly ResourceStatusItem[],
): boolean {
  const status = summarizeResourceStatuses(resources).status;
  return status === "loading" || status === "refreshing" || status === "error";
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
  requestedTab,
  focusState,
  onFocusStateChange,
  workspaceLabel,
  workspacePath,
  computerOrigin,
}: {
  active: boolean;
  navigationIntent: DesktopNavigationIntent | null;
  onAcknowledgeNavigationIntent: (id: string) => void;
  onSectionChange: (section: WorkTabId) => void;
  onSendToChat: (request: ChatContextRequest) => void;
  onOpenWorkspaceFile?: (path: string) => void;
  projectScope?: string;
  requestedTab?: LinkedWorkTab;
  focusState?: OrchestrationFocusState;
  onFocusStateChange?: (state: OrchestrationFocusState) => void;
  workspaceLabel?: string;
  workspacePath?: string;
  computerOrigin?: ComputerOrigin;
}) {
  const [localTab, setLocalTab] = useState<LocalWorkTab>(() => {
    const restored = focusState?.activeTab;
    return !requestedTab && (restored === "runs" || restored === "plans")
      ? restored
      : "tasks";
  });
  const activeTab = requestedTab ?? localTab;
  const [selectedTaskId, setSelectedTaskId] = useState(
    () => focusState?.selectedTaskId ?? "",
  );
  const [selectedWorkerId, setSelectedWorkerId] = useState(
    () => focusState?.selectedWorkerId ?? "",
  );
  const [selectedPlanId, setSelectedPlanId] = useState(
    () => focusState?.selectedPlanId ?? "",
  );
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(
    () => focusState?.selectedWorkflowId ?? "",
  );
  const [selectedRunId, setSelectedRunId] = useState(
    () => focusState?.selectedRunId ?? "",
  );
  const consumedNavigationIntents = useRef(new Set<string>());

  useEffect(() => {
    onFocusStateChange?.({
      activeTab,
      selectedTaskId,
      selectedWorkerId,
      selectedPlanId,
      selectedWorkflowId,
      selectedRunId,
    });
  }, [
    activeTab,
    onFocusStateChange,
    selectedPlanId,
    selectedRunId,
    selectedTaskId,
    selectedWorkerId,
    selectedWorkflowId,
  ]);

  useEffect(() => {
    // The base Work destination opens its queue after a linked view.
    if (requestedTab) setLocalTab("tasks");
  }, [requestedTab]);

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
    computerOrigin,
    platform: window.doolittle.platform,
  });

  const statusResources = useMemo<ReadonlyArray<ResourceStatusItem>>(() => {
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
  const showResourceStatus = shouldShowWorkResourceStatus(statusResources);

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
  } = useOrchestrationActions({
    active,
    computerOrigin,
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
    setLocalTab("tasks");
    onSectionChange("tasks");
    setSelectedTaskId(resolution.taskId);
    onAcknowledgeNavigationIntent(navigationIntent.id);
  }, [
    active,
    navigationIntent,
    onAcknowledgeNavigationIntent,
    onSectionChange,
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
    if (tab === "tasks" || tab === "runs" || tab === "plans") setLocalTab(tab);
    onSectionChange(tab);
  };
  const activeTabLabel = WORK_TABS.find((tab) => tab.id === activeTab)?.label;

  return (
    <div className={oc("orchestration-page")}>
      <header className={oc("orchestration-header")}>
        <div>
          <h1>Work</h1>
          <p>{projectScope === "all" ? "All projects" : workspaceLabel}</p>
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
            className={`${ICON_BUTTON_CLASS} ${oc("orchestration-refresh")}`}
            type="button"
            onClick={refreshAll}
            disabled={!active}
            aria-label="Refresh orchestration data"
            title="Refresh"
          >
            <UiIcon icon={RefreshCw} size="sm" />
          </button>
        </div>
      </header>

      {showResourceStatus ? (
        <ResourceStatusBar resources={statusResources} />
      ) : null}

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
        <PanelTabs
          id="work"
          label="Work views"
          items={WORK_TABS}
          selected={activeTab}
          onSelect={selectTab}
        />
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
                onClick={() =>
                  showTaskCreate ? setShowTaskCreate(false) : openTaskCreate()
                }
                aria-expanded={showTaskCreate}
                disabled={!active || Boolean(busyKeys["task:create"])}
              >
                New task
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

      {!active && activeTab !== "automations" && activeTab !== "inbox" ? (
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
        id="work-panel"
        role="tabpanel"
        aria-labelledby={`work-${activeTab}-tab`}
        className={oc("orchestration-panel")}
      >
        <Suspense
          fallback={
            <div className={oc("orchestration-loading")} role="status">
              Loading {activeTabLabel?.toLowerCase() ?? "work"}…
            </div>
          }
        >
          {activeTab === "review" ? (
            <ReviewPage
              active={active}
              computerOrigin={computerOrigin}
              embedded
              key={JSON.stringify([
                projectScope,
                workspacePath ?? "",
                computerOrigin?.botId ?? "",
                computerOrigin?.originConversationId ?? "",
                computerOrigin?.workspacePath ?? "",
              ])}
              onOpenWorkspaceFile={onOpenWorkspaceFile}
              onSendToChat={onSendToChat}
              projectScope={projectScope}
              workspacePath={workspacePath ?? ""}
            />
          ) : null}
          {activeTab === "automations" ? (
            <AutomationsPage active={active} />
          ) : null}
          {activeTab === "inbox" ? (
            <GatewayPage active={active} embedded />
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
              confirmDialogRef={confirmDialogRef}
              onSelectTask={(task) => {
                setSelectedTaskId(task.id);
                setConfirmedAction(null);
                setShowChildCreate(false);
              }}
              onRunTaskAction={runTaskAction}
              onRunBulkTaskAction={runBulkTaskAction}
              onRequestDestructiveAction={requestDestructiveTaskAction}
              onCloseConfirmation={closeTaskConfirmation}
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
            <div className="grid gap-6">
              <Suspense fallback={<p role="status">Loading bot teams…</p>}>
                <TeamManagementPanel active={active} />
              </Suspense>
              <AgentRosterPanel
                workersResource={workersResource}
                workers={workers}
                workerOverview={workerOverview}
                selectedWorker={selectedWorker}
                onSelectWorker={(worker) => setSelectedWorkerId(worker.id)}
              />
            </div>
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
              onSelectWorkflow={selectWorkflow}
              onSelectRun={setSelectedRunId}
              onRequestRunCancellation={setConfirmedRunCancellation}
              onDismissRunCancellation={() => setConfirmedRunCancellation("")}
              onLoadBundle={loadBundle}
              onCancelRun={cancelCodegenRun}
            />
          ) : null}
        </Suspense>
      </section>
    </div>
  );
}
