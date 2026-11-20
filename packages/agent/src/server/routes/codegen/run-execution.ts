import type { AppContext } from "../../../runtime/bootstrap/index";
import {
  type AutocoderPipelineRunKind,
  type AutocoderPipelineRunRecord,
  AutocoderRunCancelledError,
} from "../../../services/autocoder-pipeline/index";

import {
  completeAutocoderWorkflowContext,
  createAutocoderWorkflowContext,
  failAutocoderWorkflowContext,
} from "../../autocoder-workflow-context";
import { json } from "../../responses";

interface AutocoderRunInput {
  workflowId: string;
  kind: AutocoderPipelineRunKind;
  projectName?: string;
  repositoryName?: string;
  sessionId?: string;
  taskId?: string;
  request: Record<string, unknown>;
  parentRunId?: string;
}

interface CompletedAutocoderRun<T> {
  run: AutocoderPipelineRunRecord;
  result: T;
}

/**
 * Adds cooperative cancellation signals without serializing them into the
 * persisted request artifact or exposing them in generated output.
 */
export function withAutocoderAbortSignal(
  request: Record<string, unknown>,
  signal: AbortSignal,
): Record<string, unknown> {
  const cancellableRequest = { ...request };
  Object.defineProperties(cancellableRequest, {
    abortSignal: {
      configurable: false,
      enumerable: false,
      value: signal,
      writable: false,
    },
    signal: {
      configurable: false,
      enumerable: false,
      value: signal,
      writable: false,
    },
  });
  return cancellableRequest;
}

async function executeTrackedAutocoderRun<T>(
  context: AppContext,
  input: AutocoderRunInput,
  operation: (signal: AbortSignal) => Promise<T> | T,
  options?: {
    linkedRunIds?: string[];
  },
): Promise<CompletedAutocoderRun<T>> {
  const started = context.services.autocoderPipeline.startRun(input);
  try {
    const result = await context.services.autocoderPipeline.executeRun(
      started.id,
      operation,
    );
    const latest = context.services.autocoderPipeline.get(started.id);
    if (latest?.status === "cancelled") {
      throw new AutocoderRunCancelledError(
        started.id,
        latest.outputPreview || "cancelled",
      );
    }
    return {
      run: context.services.autocoderPipeline.completeRun(started.id, result, {
        linkedRunIds: options?.linkedRunIds,
      }),
      result,
    };
  } catch (error) {
    const latest = context.services.autocoderPipeline.get(started.id);
    if (
      error instanceof AutocoderRunCancelledError ||
      latest?.status === "cancelled"
    ) {
      throw error instanceof AutocoderRunCancelledError
        ? error
        : new AutocoderRunCancelledError(
            started.id,
            latest?.outputPreview || "cancelled",
          );
    }
    context.services.autocoderPipeline.failRun(
      started.id,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

type WorkflowStep = <T>(
  input: Pick<AutocoderRunInput, "kind" | "request" | "parentRunId">,
  operation: (signal: AbortSignal) => Promise<T> | T,
  options?: { linkedRunIds?: string[] },
) => Promise<CompletedAutocoderRun<T>>;

export async function runCodegenWorkflow(
  context: AppContext,
  input: Parameters<typeof createAutocoderWorkflowContext>[1],
  completionNote: string,
  execute: (step: WorkflowStep) => Promise<object>,
): Promise<Response> {
  const workflow = await createAutocoderWorkflowContext(context, input);
  const step: WorkflowStep = (run, operation, options) =>
    executeTrackedAutocoderRun(
      context,
      {
        ...run,
        ...workflow,
        projectName: input.projectName,
        repositoryName: input.repositoryName,
      },
      operation,
      options,
    );
  const { workflowId, taskId } = workflow;
  try {
    const result = await execute(step);
    await completeAutocoderWorkflowContext(
      context,
      taskId,
      workflowId,
      completionNote,
    );
    return json({ workflowId, taskId, ...result });
  } catch (error) {
    await failAutocoderWorkflowContext(context, taskId, workflowId, error);
    if (!(error instanceof AutocoderRunCancelledError)) throw error;
    return json(
      {
        error: error.message,
        runId: error.runId,
        workflowId,
        taskId,
        cancelled: true,
      },
      409,
    );
  }
}
