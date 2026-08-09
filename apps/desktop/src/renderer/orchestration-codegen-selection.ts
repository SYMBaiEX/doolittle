type IdentifiedRecord = { id: string };

export type CodegenSelectionProjection<
  TWorkflow extends IdentifiedRecord,
  TRun extends IdentifiedRecord,
> = {
  selectedWorkflow?: TWorkflow;
  selectedRun?: TRun;
  visibleRuns: readonly TRun[];
  selectedWorkflowIdUpdate?: string;
  selectedRunIdUpdate?: string;
};

/**
 * Projects the workflow/run selection without allowing a stale workflow detail
 * response to be shown as the active workflow's run list.
 */
export function projectCodegenSelection<
  TWorkflow extends IdentifiedRecord,
  TRun extends IdentifiedRecord,
>(input: {
  workflows: readonly TWorkflow[];
  globalRuns: readonly TRun[];
  workflowDetailRuns: readonly TRun[];
  selectedWorkflowId: string;
  selectedRunId: string;
  detailWorkflowId: string;
  workflowDetailLoading: boolean;
  detailedRun?: TRun;
}): CodegenSelectionProjection<TWorkflow, TRun> {
  const selectedWorkflow =
    input.workflows.find(
      (workflow) => workflow.id === input.selectedWorkflowId,
    ) ?? input.workflows[0];
  const selectedWorkflowIdUpdate =
    selectedWorkflow && selectedWorkflow.id !== input.selectedWorkflowId
      ? selectedWorkflow.id
      : undefined;
  const workflowDetailMatches =
    Boolean(input.selectedWorkflowId) &&
    !input.workflowDetailLoading &&
    input.detailWorkflowId === input.selectedWorkflowId;
  const visibleRuns = input.selectedWorkflowId
    ? workflowDetailMatches
      ? input.workflowDetailRuns
      : []
    : input.globalRuns;

  if (input.selectedWorkflowId && !workflowDetailMatches) {
    return {
      selectedWorkflow,
      visibleRuns,
      selectedWorkflowIdUpdate,
    };
  }

  const detailedRun =
    input.detailedRun?.id === input.selectedRunId
      ? input.detailedRun
      : undefined;
  const selectedRun =
    detailedRun ??
    visibleRuns.find((run) => run.id === input.selectedRunId) ??
    visibleRuns[0];
  const selectedRunIdUpdate =
    visibleRuns.length === 0
      ? input.selectedRunId
        ? ""
        : undefined
      : selectedRun?.id !== input.selectedRunId
        ? selectedRun?.id
        : undefined;

  return {
    selectedWorkflow,
    selectedRun,
    visibleRuns,
    selectedWorkflowIdUpdate,
    selectedRunIdUpdate,
  };
}
