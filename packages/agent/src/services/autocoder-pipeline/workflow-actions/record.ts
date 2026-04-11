import type {
  AutocoderPipelineLifecycleStatus,
  AutocoderPipelineRunRecord,
  AutocoderPipelineWorkflowRecord,
} from "../service";
import {
  buildAutocoderPipelineRecordOutcome,
  buildAutocoderPipelineWorkflowDraft,
} from "../workflow-actions-decisions";
import type { AutocoderPipelineWorkflowHelpers } from "./helpers";
import type { AutocoderPipelineWorkflowRunActions } from "./run";
import type { AutocoderPipelineWorkflowStartActions } from "./workflow";

export interface AutocoderPipelineWorkflowRecordActions {
  record(input: {
    workflowId?: string;
    title?: string;
    objective?: string;
    kind: import("../service").AutocoderPipelineRunKind;
    projectName?: string;
    repositoryName?: string;
    sessionId?: string;
    taskId?: string;
    status?: Exclude<AutocoderPipelineLifecycleStatus, "pending" | "running">;
    request: Record<string, unknown>;
    result: unknown;
    linkedRunIds?: string[];
    parentRunId?: string;
  }): AutocoderPipelineRunRecord;
}

export function createAutocoderPipelineWorkflowRecordActions(
  helpers: AutocoderPipelineWorkflowHelpers,
  startActions: AutocoderPipelineWorkflowStartActions,
  runActions: AutocoderPipelineWorkflowRunActions,
): AutocoderPipelineWorkflowRecordActions {
  const record: AutocoderPipelineWorkflowRecordActions["record"] = (input) => {
    const workflow: AutocoderPipelineWorkflowRecord = input.workflowId
      ? helpers.requireWorkflow(helpers.loadStore(), input.workflowId)
      : startActions.startWorkflow(buildAutocoderPipelineWorkflowDraft(input));
    const run = startActions.startRun({
      workflowId: workflow.id,
      kind: input.kind,
      projectName: input.projectName,
      repositoryName: input.repositoryName,
      sessionId: input.sessionId,
      taskId: input.taskId,
      request: input.request,
      parentRunId: input.parentRunId,
    });
    const outcome = buildAutocoderPipelineRecordOutcome(input);
    if (outcome.status === "failed") {
      return runActions.failRun(run.id, outcome.result, {
        linkedRunIds: outcome.linkedRunIds,
      });
    }
    if (outcome.status === "cancelled") {
      return runActions.cancelRun(run.id, outcome.result);
    }
    return runActions.completeRun(run.id, outcome.result, {
      linkedRunIds: outcome.linkedRunIds,
    });
  };

  return {
    record,
  };
}
