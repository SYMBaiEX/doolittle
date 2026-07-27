import type { AppContext } from "@/runtime/bootstrap";
import {
  type AutocoderPipelineRunKind,
  type AutocoderPipelineRunRecord,
  AutocoderRunCancelledError,
} from "@/services/autocoder-pipeline";

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

export async function executeTrackedAutocoderRun<T>(
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

export function isAutocoderCancellation(
  error: unknown,
): error is AutocoderRunCancelledError {
  return error instanceof AutocoderRunCancelledError;
}
