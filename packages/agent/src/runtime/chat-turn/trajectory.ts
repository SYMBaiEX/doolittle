import {
  getTrajectoryContext,
  type IAgentRuntime,
  resolveTrajectoryLogger,
  runWithTrajectoryContext,
  type TrajectoryContext,
  withStandaloneTrajectory,
} from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { TrajectoryEventInput } from "@/types/trajectory";

type TrajectoryRecorder = {
  recordEvent(input: TrajectoryEventInput): unknown;
};

export function recordTrajectoryEvent(
  context: AgentExecutionContext,
  input: TrajectoryEventInput,
): void {
  try {
    const trajectories = (
      context.services as { trajectories?: TrajectoryRecorder }
    ).trajectories;
    trajectories?.recordEvent(input);
  } catch (error) {
    const logger = (context as { runtime?: AgentExecutionContext["runtime"] })
      .runtime?.logger;
    logger?.warn(
      { error, event: input.event, category: input.category },
      "Failed to record trajectory event",
    );
  }
}

export function elapsedMsSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

export type SdkTrajectoryTurnOptions = {
  runId?: string;
  roomId?: string;
  messageId?: string;
  source: string;
  purpose: string;
  metadata?: Record<string, unknown>;
  metadataTarget?: { metadata?: unknown };
};

function isSdkTrajectoryRuntime(runtime: unknown): runtime is IAgentRuntime {
  return (
    !!runtime &&
    typeof runtime === "object" &&
    typeof (runtime as { agentId?: unknown }).agentId === "string" &&
    typeof (runtime as { getService?: unknown }).getService === "function" &&
    typeof (runtime as { getServicesByType?: unknown }).getServicesByType ===
      "function"
  );
}

function resolveSdkLogger(runtime: unknown): unknown {
  if (!isSdkTrajectoryRuntime(runtime)) {
    return null;
  }
  try {
    return resolveTrajectoryLogger(runtime);
  } catch {
    return null;
  }
}

export function readSdkTrajectoryStepId(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const stepId = (metadata as { trajectoryStepId?: unknown }).trajectoryStepId;
  return typeof stepId === "string" && stepId.trim()
    ? stepId.trim()
    : undefined;
}

function attachSdkTrajectoryStepId(
  target: SdkTrajectoryTurnOptions["metadataTarget"],
  stepId: string | undefined,
): void {
  if (!target || !stepId) {
    return;
  }
  const metadata =
    target.metadata && typeof target.metadata === "object"
      ? (target.metadata as Record<string, unknown>)
      : {};
  if (!readSdkTrajectoryStepId(metadata)) {
    metadata.trajectoryStepId = stepId;
  }
  target.metadata = metadata;
}

function mergeTrajectoryContext(
  options: SdkTrajectoryTurnOptions,
): TrajectoryContext {
  const active = getTrajectoryContext();
  const trajectoryStepId =
    readSdkTrajectoryStepId(options.metadataTarget?.metadata) ??
    active?.trajectoryStepId;
  return {
    ...active,
    trajectoryStepId,
    runId: options.runId ?? active?.runId,
    roomId: options.roomId ?? active?.roomId,
    messageId: options.messageId ?? active?.messageId,
    purpose: options.purpose ?? active?.purpose,
  };
}

export async function runWithSdkTrajectoryContext<T>(
  context: AgentExecutionContext,
  options: SdkTrajectoryTurnOptions,
  callback: () => Promise<T> | T,
): Promise<T> {
  const runWithMergedContext = () => {
    const trajectoryContext = mergeTrajectoryContext(options);
    attachSdkTrajectoryStepId(
      options.metadataTarget,
      trajectoryContext.trajectoryStepId,
    );
    return runWithTrajectoryContext(trajectoryContext, callback);
  };

  const hasExistingStep =
    !!readSdkTrajectoryStepId(options.metadataTarget?.metadata) ||
    !!getTrajectoryContext()?.trajectoryStepId;
  if (hasExistingStep || !resolveSdkLogger(context.runtime)) {
    return await runWithMergedContext();
  }

  try {
    return await withStandaloneTrajectory(
      context.runtime as IAgentRuntime,
      {
        source: options.source,
        metadata: options.metadata,
      },
      runWithMergedContext,
    );
  } catch (error) {
    context.runtime.logger?.warn(
      { error, source: options.source, purpose: options.purpose },
      "Failed to run with SDK trajectory context",
    );
    return await runWithMergedContext();
  }
}
