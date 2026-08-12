export type CodingWorkspaceRequestState = {
  active: boolean;
  hasWorkspace: boolean;
  explorerVisible: boolean;
  utilityVisible: boolean;
  leftPane: "files" | "changes" | "search";
  editorPane: "file" | "diff";
  utilityPane: "terminal" | "commits" | "source-control" | "worktrees";
  hasSelectedPath: boolean;
  hasSearchQuery: boolean;
};

export function codingWorkspaceRequests(state: CodingWorkspaceRequestState) {
  const available = state.active && state.hasWorkspace;
  const sourceControlVisible =
    state.utilityVisible && state.utilityPane === "source-control";
  const changesVisible =
    (state.explorerVisible && state.leftPane === "changes") ||
    state.editorPane === "diff" ||
    sourceControlVisible;

  return {
    summary: available,
    tree: available && state.explorerVisible && state.leftPane === "files",
    changes: available && changesVisible,
    log: available && state.utilityVisible && state.utilityPane === "commits",
    worktrees:
      available && state.utilityVisible && state.utilityPane === "worktrees",
    sourceControl: available && sourceControlVisible,
    search:
      available &&
      state.explorerVisible &&
      state.leftPane === "search" &&
      state.hasSearchQuery,
    file: available && state.editorPane === "file" && state.hasSelectedPath,
    patch: available && state.editorPane === "diff" && state.hasSelectedPath,
  };
}

export type OrchestrationTab = "tasks" | "agents" | "plans" | "runs" | "review";

export function orchestrationRequests({
  active,
  activeTab,
  hasSelectedWorkflow,
  hasSelectedRun,
}: {
  active: boolean;
  activeTab: OrchestrationTab;
  hasSelectedWorkflow: boolean;
  hasSelectedRun: boolean;
}) {
  const runsVisible = activeTab === "runs";

  return {
    overview: active,
    // These back the persistent header's scoped and completed counts.
    tasks: active,
    workers: active && activeTab === "agents",
    worktrees: active && activeTab === "tasks",
    // This backs the persistent header's approval count.
    plans: active,
    accountPool: active && activeTab === "tasks",
    codegenRuntime: active && runsVisible,
    codegenWorkflows: active && runsVisible,
    codegenRuns: active && runsVisible,
    workflowDetail: active && runsVisible && hasSelectedWorkflow,
    runDetail: active && runsVisible && hasSelectedRun,
  };
}

export function reviewRequests({
  active,
  evidenceOpen,
  sourceControlOpen,
}: {
  active: boolean;
  evidenceOpen: boolean;
  sourceControlOpen: boolean;
}) {
  return {
    primary: active,
    sourceControl: active && evidenceOpen && sourceControlOpen,
  };
}

export function sessionDetailRequests({
  active,
  continuityOpen,
}: {
  active: boolean;
  continuityOpen: boolean;
}) {
  return {
    primary: active,
    continuity: active && continuityOpen,
  };
}

export function setupRequests({
  active,
  checklistOpen,
}: {
  active: boolean;
  checklistOpen: boolean;
}) {
  return {
    primary: active,
    checklist: active && checklistOpen,
  };
}

export function automationRequests({
  active,
  runsOpen,
}: {
  active: boolean;
  runsOpen: boolean;
}) {
  return {
    jobs: active,
    runs: active && runsOpen,
  };
}

export function modelRequests({
  active,
  readinessOpen,
}: {
  active: boolean;
  readinessOpen: boolean;
}) {
  return {
    primary: active,
    accounts: active && readinessOpen,
  };
}
