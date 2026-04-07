import { createProgressiveDeliveryQueue } from "@/gateway/outbound/builders";
import { formatRunEvent, shouldRenderRunEvent } from "@/runtime/run-progress";
import { executeAgentTurnWithProgress } from "@/runtime/turn-stream";
import type { RunUpdateEvent } from "@/services/run-controller-service";
import type { SessionRoute } from "@/types/gateway";
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
  queueProgressFlush: (text: string, force?: boolean) => Promise<void>;
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
  const trackedSessionId =
    deps.session.activeAgentSessionId ?? deps.session.sessionKey;
  const result = await executeTurn(
    {
      message: deps.message.text,
      userId: deps.message.userId,
      roomId: trackedSessionId,
      source: deps.message.platform,
    },
    deps.context,
    {
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
  return {
    response: result.response,
    runSessionId: trackedSessionId,
    progressiveDelivery: progressiveDelivery
      ? { id: progressiveDelivery.id }
      : undefined,
    queueProgressFlush: progressiveQueue.queueProgressFlush,
  };
}
