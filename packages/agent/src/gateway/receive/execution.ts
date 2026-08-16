import { createHash, randomUUID } from "node:crypto";
import { createProgressiveDeliveryQueue } from "@/gateway/outbound/builders";
import { formatRunEvent, shouldRenderRunEvent } from "@/runtime/run-progress";
import { hasGlobalSessionOperatorAccess } from "@/runtime/session-operator-policy";
import { executeAgentTurnWithProgress } from "@/runtime/turn-stream";
import type { RunUpdateEvent } from "@/services/run-controller-service";
import type { SessionRoute } from "@/types/gateway";
import { gatewayInboundIdempotencyKey } from "./idempotency";
import type {
  GatewayReceiveDependencies,
  GatewayReceiveOptions,
} from "./types";

export interface GatewayReceiveExecutionResult {
  response: string;
  runSessionId: string;
  progressiveDelivery:
    | {
        id: string;
      }
    | undefined;
  progressiveFailure:
    | {
        error: unknown;
        deliveryId?: string;
      }
    | undefined;
  queueProgressFlush: (text: string, force?: boolean) => Promise<void>;
}

function gatewayRunId(deps: GatewayReceiveDependencies): string {
  const identity = gatewayInboundIdempotencyKey(deps.message);
  if (!identity) {
    return `gateway:${randomUUID()}`;
  }
  return `gateway:${createHash("sha256").update(identity).digest("hex").slice(0, 48)}`;
}

function followAbortSignal(
  source: AbortSignal | undefined,
  target: AbortController,
): () => void {
  if (!source) return () => undefined;
  const abort = () => {
    if (!target.signal.aborted) target.abort(source.reason);
  };
  if (source.aborted) {
    abort();
    return () => undefined;
  }
  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

export async function executeGatewayReceiveTurn(
  deps: GatewayReceiveDependencies & {
    session: SessionRoute;
    createProgressiveQueue?: typeof createProgressiveDeliveryQueue;
    executeTurn?: typeof executeAgentTurnWithProgress;
  },
  options?: GatewayReceiveOptions,
): Promise<GatewayReceiveExecutionResult> {
  const createProgressiveQueue =
    deps.createProgressiveQueue ?? createProgressiveDeliveryQueue;
  const executeTurn = deps.executeTurn ?? executeAgentTurnWithProgress;
  const progressiveQueue = createProgressiveQueue({
    adapter: deps.adapter,
    message: deps.message,
    session: deps.session,
    editDelivery: deps.editDelivery,
  });
  // Older gateway routes may retain an active session selected before
  // platform-scoped operator authorization existed. Never let a nonlocal
  // connector inherit that cross-session binding during execution.
  const trackedSessionId = hasGlobalSessionOperatorAccess(deps.message.platform)
    ? (deps.session.activeAgentSessionId ?? deps.session.sessionKey)
    : deps.session.sessionKey;
  const runId = gatewayRunId(deps);
  const releaseWorkspace =
    deps.context.services.runController.registerWorkspaceRun(
      runId,
      deps.context.config.workspaceDir,
    );
  const controller = new AbortController();
  const stopFollowingRequest = followAbortSignal(
    options?.abortSignal,
    controller,
  );
  const unregisterAbort =
    deps.context.services.runController.registerAbortController(
      runId,
      controller,
    );

  try {
    const result = await executeTurn(
      {
        message: deps.message.text,
        userId: deps.message.userId,
        roomId: trackedSessionId,
        runId,
        source: deps.message.platform,
        attachments: deps.message.attachments,
      },
      deps.context,
      {
        abortSignal: controller.signal,
        onProgress: async ({ delta, response, phase }) => {
          if (!delta) {
            return;
          }
          await progressiveQueue.queueProgressFlush(response, false);
          await options?.onResponseProgress?.({
            chunk: delta,
            response,
            phase,
          });
        },
        onRunEvent: async (event: RunUpdateEvent) => {
          void options?.onRunUpdate?.(event);
          if (!shouldRenderRunEvent(event.run.progressMode, event)) {
            return;
          }
          const detail = formatRunEvent(event, 120);
          if (!detail) {
            return;
          }
          await progressiveQueue.queueProgressFlush(`[run] ${detail}`, false);
        },
      },
    );

    await progressiveQueue.queueProgressFlush(result.response, true);
    const progressiveDelivery = progressiveQueue.getProgressiveDelivery();
    const progressiveFailure = progressiveQueue.getProgressiveFailure();
    return {
      response: result.response,
      runSessionId: trackedSessionId,
      progressiveDelivery: progressiveDelivery
        ? { id: progressiveDelivery.id }
        : undefined,
      progressiveFailure: progressiveFailure
        ? {
            error: progressiveFailure.error,
            deliveryId: progressiveFailure.deliveryId,
          }
        : undefined,
      queueProgressFlush: progressiveQueue.queueProgressFlush,
    };
  } finally {
    unregisterAbort();
    stopFollowingRequest();
    releaseWorkspace();
  }
}
