import type {
  AutocoderPipelineRunKind,
  AutocoderPipelineRunRecord,
  AutocoderPipelineWorkflowRecord,
} from "./service";

interface AutocoderPipelineStoreShape {
  runs: AutocoderPipelineRunRecord[];
  workflows: AutocoderPipelineWorkflowRecord[];
}

export function findAutocoderLatestRun(
  store: AutocoderPipelineStoreShape,
  kind?: AutocoderPipelineRunKind,
): AutocoderPipelineRunRecord | undefined {
  return store.runs.find((entry) => (kind ? entry.kind === kind : true));
}

export function findAutocoderLatestWorkflow(
  store: AutocoderPipelineStoreShape,
  kind?: AutocoderPipelineRunKind,
): AutocoderPipelineWorkflowRecord | undefined {
  return store.workflows.find((entry) => (kind ? entry.kind === kind : true));
}

export function buildAutocoderWorkflowView(
  store: AutocoderPipelineStoreShape,
  id: string,
): {
  workflow?: AutocoderPipelineWorkflowRecord;
  runs: AutocoderPipelineRunRecord[];
  tree: Array<
    AutocoderPipelineRunRecord & { children: AutocoderPipelineRunRecord[] }
  >;
} {
  const workflow = store.workflows.find((entry) => entry.id === id);
  const runs = store.runs
    .filter((entry) => entry.workflowId === id)
    .slice()
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const children = new Map<string, AutocoderPipelineRunRecord[]>();

  for (const run of runs) {
    if (!run.parentRunId) {
      continue;
    }
    const bucket = children.get(run.parentRunId) ?? [];
    bucket.push(run);
    children.set(run.parentRunId, bucket);
  }

  return {
    workflow,
    runs,
    tree: runs
      .filter((run) => !run.parentRunId)
      .map((run) => ({
        ...run,
        children: children.get(run.id) ?? [],
      })),
  };
}

export function bundleAutocoderWorkflow(input: {
  store: AutocoderPipelineStoreShape;
  id: string;
  nowIso: () => string;
  writeArtifact: (
    runId: string,
    targetName: string | undefined,
    kind: string,
    value: unknown,
  ) => string;
  saveStore: (store: AutocoderPipelineStoreShape) => void;
}): {
  workflow?: AutocoderPipelineWorkflowRecord;
  runs: AutocoderPipelineRunRecord[];
  manifestPath?: string;
} {
  const view = buildAutocoderWorkflowView(input.store, input.id);
  if (!view.workflow) {
    return view;
  }

  const manifestPath = input.writeArtifact(
    view.workflow.id,
    view.workflow.projectName ??
      view.workflow.repositoryName ??
      view.workflow.title,
    "workflow",
    {
      workflow: view.workflow,
      runs: view.runs,
      generatedAt: input.nowIso(),
    },
  );
  const workflow = input.store.workflows.find((entry) => entry.id === input.id);
  if (workflow && !workflow.artifactPaths.includes(manifestPath)) {
    workflow.artifactPaths.push(manifestPath);
    workflow.updatedAt = input.nowIso();
    input.saveStore(input.store);
    view.workflow = workflow;
  }
  return {
    workflow: view.workflow,
    runs: view.runs,
    manifestPath,
  };
}

export function buildAutocoderPipelineSummary(
  store: AutocoderPipelineStoreShape,
): {
  total: number;
  workflows: number;
  latest?: AutocoderPipelineRunRecord;
  latestWorkflow?: AutocoderPipelineWorkflowRecord;
  counts: Record<string, number>;
  failed: number;
  failedWorkflows: number;
  running: number;
  runningWorkflows: number;
} {
  const counts = store.runs.reduce<Record<string, number>>((acc, run) => {
    acc[run.kind] = (acc[run.kind] ?? 0) + 1;
    return acc;
  }, {});

  return {
    total: store.runs.length,
    workflows: store.workflows.length,
    latest: store.runs[0],
    latestWorkflow: store.workflows[0],
    counts,
    failed: store.runs.filter((run) => run.status === "failed").length,
    failedWorkflows: store.workflows.filter(
      (workflow) => workflow.status === "failed",
    ).length,
    running: store.runs.filter((run) => run.status === "running").length,
    runningWorkflows: store.workflows.filter(
      (workflow) => workflow.status === "running",
    ).length,
  };
}
