import type { AutocoderPipelinePersistence } from "../persistence";
import type {
  AutocoderPipelineLifecycleStatus,
  AutocoderPipelineRunKind,
  AutocoderPipelineRunRecord,
  AutocoderPipelineWorkflowRecord,
} from "../service";
import { createAutocoderPipelineWorkflowBundleActions } from "./bundle";
import { createAutocoderPipelineWorkflowHelpers } from "./helpers";
import { createAutocoderPipelineWorkflowRecordActions } from "./record";
import { createAutocoderPipelineWorkflowRunActions } from "./run";
import { createAutocoderPipelineWorkflowStartActions } from "./workflow";

export interface AutocoderPipelineWorkflowActions {
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
  completeRun(
    id: string,
    result: unknown,
    options?: {
      linkedRunIds?: string[];
    },
  ): AutocoderPipelineRunRecord;
  failRun(
    id: string,
    error: string,
    options?: {
      linkedRunIds?: string[];
    },
  ): AutocoderPipelineRunRecord;
  cancelRun(id: string, reason?: string): AutocoderPipelineRunRecord;
  record(input: {
    workflowId?: string;
    title?: string;
    objective?: string;
    kind: AutocoderPipelineRunKind;
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
  bundleWorkflow(id: string): {
    workflow?: AutocoderPipelineWorkflowRecord;
    runs: AutocoderPipelineRunRecord[];
    manifestPath?: string;
  };
}

export function createAutocoderPipelineWorkflowActions(
  persistence: AutocoderPipelinePersistence,
): AutocoderPipelineWorkflowActions {
  const helpers = createAutocoderPipelineWorkflowHelpers(persistence);
  const startActions = createAutocoderPipelineWorkflowStartActions(
    persistence,
    helpers,
  );
  const runActions = createAutocoderPipelineWorkflowRunActions(helpers);
  const recordActions = createAutocoderPipelineWorkflowRecordActions(
    helpers,
    startActions,
    runActions,
  );
  const bundleActions = createAutocoderPipelineWorkflowBundleActions(helpers);

  return {
    ...startActions,
    ...runActions,
    ...recordActions,
    ...bundleActions,
  };
}
