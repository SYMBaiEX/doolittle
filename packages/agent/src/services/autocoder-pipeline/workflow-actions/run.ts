import type {
  AutocoderPipelineLifecycleStatus,
  AutocoderPipelineRunRecord,
} from "../service";
import { createAutocoderPipelineErrorResult } from "../workflow-actions-decisions";
import type { AutocoderPipelineWorkflowHelpers } from "./helpers";

export interface AutocoderPipelineWorkflowRunActions {
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
}

interface FinishRunInput {
  status: Exclude<AutocoderPipelineLifecycleStatus, "pending" | "running">;
  result: unknown;
  linkedRunIds?: string[];
}

export function createAutocoderPipelineWorkflowRunActions(
  helpers: AutocoderPipelineWorkflowHelpers,
): AutocoderPipelineWorkflowRunActions {
  const finishRun = (
    id: string,
    input: FinishRunInput,
  ): AutocoderPipelineRunRecord => helpers.finishRun(id, input);

  const completeRun: AutocoderPipelineWorkflowRunActions["completeRun"] = (
    id,
    result,
    options,
  ) =>
    finishRun(id, {
      status: "completed",
      result,
      linkedRunIds: options?.linkedRunIds,
    });

  const failRun: AutocoderPipelineWorkflowRunActions["failRun"] = (
    id,
    error,
    options,
  ) => {
    const record = finishRun(id, {
      status: "failed",
      result: createAutocoderPipelineErrorResult(error),
      linkedRunIds: options?.linkedRunIds,
    });
    record.error = error;
    const store = helpers.loadStore();
    const persisted = store.runs.find((entry) => entry.id === id);
    if (persisted) {
      persisted.error = error;
      helpers.refreshWorkflowState(store, persisted.workflowId);
      helpers.saveStore(store);
      return persisted;
    }
    return record;
  };

  const cancelRun: AutocoderPipelineWorkflowRunActions["cancelRun"] = (
    id,
    reason = "cancelled",
  ) =>
    finishRun(id, {
      status: "cancelled",
      result: { cancelled: true, reason },
    });

  return {
    completeRun,
    failRun,
    cancelRun,
  };
}
