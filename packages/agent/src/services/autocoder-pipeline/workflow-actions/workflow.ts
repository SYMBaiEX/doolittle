import type { AutocoderPipelinePersistence } from "../persistence";
import type {
  AutocoderPipelineRunKind,
  AutocoderPipelineRunRecord,
  AutocoderPipelineWorkflowRecord,
} from "../service";
import type { AutocoderPipelineWorkflowHelpers } from "./helpers";

export interface AutocoderPipelineWorkflowStartActions {
  startWorkflow(input: {
    title: string;
    objective: string;
    kind: AutocoderPipelineRunKind;
    projectName?: string;
    repositoryName?: string;
    sessionId?: string;
    taskId?: string;
  }): AutocoderPipelineWorkflowRecord;
  startRun(input: {
    workflowId: string;
    kind: AutocoderPipelineRunKind;
    projectName?: string;
    repositoryName?: string;
    sessionId?: string;
    taskId?: string;
    request: Record<string, unknown>;
    parentRunId?: string;
  }): AutocoderPipelineRunRecord;
}

export function createAutocoderPipelineWorkflowStartActions(
  persistence: AutocoderPipelinePersistence,
  helpers: AutocoderPipelineWorkflowHelpers,
): AutocoderPipelineWorkflowStartActions {
  const startWorkflow: AutocoderPipelineWorkflowStartActions["startWorkflow"] =
    (input) => {
      const store = helpers.loadStore();
      const createdAt = helpers.nowIso();
      const workflow: AutocoderPipelineWorkflowRecord = {
        id: persistence.nextId(
          "workflow",
          input.projectName ?? input.repositoryName ?? input.kind,
        ),
        createdAt,
        updatedAt: createdAt,
        startedAt: createdAt,
        title: input.title,
        objective: input.objective,
        kind: input.kind,
        projectName: input.projectName,
        repositoryName: input.repositoryName,
        sessionId: input.sessionId,
        taskId: input.taskId,
        status: "running",
        runIds: [],
        artifactPaths: [],
      };
      store.workflows.unshift(workflow);
      helpers.saveStore(store);
      return workflow;
    };

  const startRun: AutocoderPipelineWorkflowStartActions["startRun"] = (
    input,
  ) => {
    const store = helpers.loadStore();
    const workflow = helpers.requireWorkflow(store, input.workflowId);
    const startedAt = helpers.nowIso();
    const run: AutocoderPipelineRunRecord = {
      id: persistence.nextId(
        input.kind,
        input.projectName ?? input.repositoryName,
      ),
      workflowId: workflow.id,
      parentRunId: input.parentRunId,
      taskId: input.taskId ?? workflow.taskId,
      createdAt: startedAt,
      updatedAt: startedAt,
      startedAt,
      phase: input.kind,
      kind: input.kind,
      projectName: input.projectName ?? workflow.projectName,
      repositoryName: input.repositoryName ?? workflow.repositoryName,
      sessionId: input.sessionId ?? workflow.sessionId,
      status: "running",
      input: input.request,
      outputPreview: "running",
      artifactPaths: [],
    };
    const requestPath = persistence.writeArtifact(
      run.id,
      input.projectName ?? input.repositoryName ?? input.kind,
      "request",
      input.request,
    );
    run.artifactPaths.push(requestPath);
    store.runs.unshift(run);
    workflow.runIds.push(run.id);
    workflow.latestRunId = run.id;
    workflow.updatedAt = startedAt;
    workflow.status = "running";
    helpers.saveStore(store);
    return run;
  };

  return {
    startWorkflow,
    startRun,
  };
}
