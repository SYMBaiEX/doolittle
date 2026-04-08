import type {
  AutocoderPipelinePersistence,
  AutocoderPipelineStore,
} from "../persistence";
import type {
  AutocoderPipelineLifecycleStatus,
  AutocoderPipelineRunRecord,
  AutocoderPipelineWorkflowRecord,
} from "../service";
import { summarizeAutocoderPipelineValue } from "../workflow-actions-decisions";

export interface AutocoderPipelineWorkflowHelpers {
  persistence: AutocoderPipelinePersistence;
  loadStore(): AutocoderPipelineStore;
  saveStore(store: AutocoderPipelineStore): void;
  requireWorkflow(
    store: AutocoderPipelineStore,
    id: string,
  ): AutocoderPipelineWorkflowRecord;
  refreshWorkflowState(store: AutocoderPipelineStore, workflowId: string): void;
  finishRun(
    id: string,
    input: {
      status: Exclude<AutocoderPipelineLifecycleStatus, "pending" | "running">;
      result: unknown;
      linkedRunIds?: string[];
    },
  ): AutocoderPipelineRunRecord;
  nowIso(): string;
}

export function createAutocoderPipelineWorkflowHelpers(
  persistence: AutocoderPipelinePersistence,
): AutocoderPipelineWorkflowHelpers {
  const nowIso = (): string => new Date().toISOString();
  const loadStore = (): AutocoderPipelineStore => persistence.loadStore();
  const saveStore = (store: AutocoderPipelineStore): void => {
    persistence.saveStore(store);
  };

  const requireWorkflow = (
    store: AutocoderPipelineStore,
    id: string,
  ): AutocoderPipelineWorkflowRecord => {
    const workflow = store.workflows.find((entry) => entry.id === id);
    if (!workflow) {
      throw new Error(`Autocoder workflow not found: ${id}`);
    }
    return workflow;
  };

  const refreshWorkflowState = (
    store: AutocoderPipelineStore,
    workflowId: string,
  ): void => {
    const workflow = store.workflows.find((entry) => entry.id === workflowId);
    if (!workflow) {
      return;
    }
    const runs = store.runs.filter((entry) => entry.workflowId === workflowId);
    workflow.runIds = runs
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((entry) => entry.id);
    workflow.latestRunId = runs[0]?.id;
    workflow.artifactPaths = Array.from(
      new Set(runs.flatMap((entry) => entry.artifactPaths)),
    );
    workflow.updatedAt = nowIso();
    const statuses = new Set(runs.map((entry) => entry.status));
    if (!runs.length) {
      workflow.status = "pending";
      workflow.completedAt = undefined;
      return;
    }
    if (statuses.has("running") || statuses.has("pending")) {
      workflow.status = "running";
      workflow.completedAt = undefined;
      return;
    }
    if (statuses.has("failed")) {
      workflow.status = "failed";
      workflow.completedAt = nowIso();
      return;
    }
    if (statuses.has("cancelled")) {
      workflow.status = "cancelled";
      workflow.completedAt = nowIso();
      return;
    }
    workflow.status = "completed";
    workflow.completedAt = nowIso();
  };

  const finishRun = (
    id: string,
    input: {
      status: Exclude<AutocoderPipelineLifecycleStatus, "pending" | "running">;
      result: unknown;
      linkedRunIds?: string[];
    },
  ): AutocoderPipelineRunRecord => {
    const store = loadStore();
    const run = store.runs.find((entry) => entry.id === id);
    if (!run) {
      throw new Error(`Autocoder pipeline run not found: ${id}`);
    }
    const completedAt = nowIso();
    const resultPath = persistence.writeArtifact(
      run.id,
      run.projectName ?? run.repositoryName ?? run.kind,
      input.status === "completed" ? "result" : input.status,
      input.result,
    );
    run.status = input.status;
    run.completedAt = completedAt;
    run.updatedAt = completedAt;
    run.outputPreview = summarizeAutocoderPipelineValue(input.result);
    run.linkedRunIds = input.linkedRunIds?.length
      ? input.linkedRunIds
      : run.linkedRunIds;
    run.artifactPaths = Array.from(new Set([...run.artifactPaths, resultPath]));
    if (input.status === "failed") {
      run.error =
        typeof input.result === "string"
          ? input.result
          : summarizeAutocoderPipelineValue(input.result);
    }
    refreshWorkflowState(store, run.workflowId);
    saveStore(store);
    return run;
  };

  return {
    persistence,
    loadStore,
    saveStore,
    requireWorkflow,
    refreshWorkflowState,
    finishRun,
    nowIso,
  };
}
