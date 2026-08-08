export type CodingWorkspaceRequestState = {
  active: boolean;
  explorerVisible: boolean;
  utilityVisible: boolean;
  leftPane: "files" | "changes" | "search";
  editorPane: "file" | "diff";
  utilityPane: "terminal" | "commits" | "source-control" | "worktrees";
  hasSelectedPath: boolean;
  hasSearchQuery: boolean;
};

export function codingWorkspaceRequests(state: CodingWorkspaceRequestState) {
  const sourceControlVisible =
    state.utilityVisible && state.utilityPane === "source-control";
  const changesVisible =
    (state.explorerVisible && state.leftPane === "changes") ||
    state.editorPane === "diff" ||
    sourceControlVisible;

  return {
    summary: state.active,
    tree: state.active && state.explorerVisible && state.leftPane === "files",
    changes: state.active && changesVisible,
    log:
      state.active && state.utilityVisible && state.utilityPane === "commits",
    worktrees:
      state.active && state.utilityVisible && state.utilityPane === "worktrees",
    sourceControl: state.active && sourceControlVisible,
    search:
      state.active &&
      state.explorerVisible &&
      state.leftPane === "search" &&
      state.hasSearchQuery,
    file: state.active && state.editorPane === "file" && state.hasSelectedPath,
    patch: state.active && state.editorPane === "diff" && state.hasSelectedPath,
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
