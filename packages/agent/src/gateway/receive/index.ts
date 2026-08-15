import { randomUUID } from "node:crypto";

import { redactTrajectoryText } from "@/services/trajectory/event-journal";
import type { SessionRoute } from "@/types/gateway";
import { deliverGatewayReceiveResponse } from "./delivery";
import { executeGatewayReceiveTurn } from "./execution";
import { setupGatewayReceive } from "./setup";
import type {
  GatewayReceiveDependencies,
  GatewayReceiveOptions,
  GatewayReceiveResult,
} from "./types";

export type {
  GatewayDeliveryStatus,
  GatewayReceiveOutcome,
} from "./outcome-types";
export type {
  GatewayReceiveDependencies,
  GatewayReceiveOptions,
  GatewayReceiveResult,
} from "./types";

export async function processGatewayReceive(
  deps: GatewayReceiveDependencies,
  options?: GatewayReceiveOptions,
): Promise<GatewayReceiveResult> {
  const traceId = randomUUID();
  const at = () => new Date().toISOString();
  const metadataKeys = Object.keys(deps.message.metadata ?? {});
  const setup = await setupGatewayReceive({
    ...deps,
    traceId,
    at,
    metadataKeys,
  });

  if (setup.response) {
    return setup.response;
  }
  if (!setup.session) {
    return {
      ok: false,
      response: "Unable to initialize gateway receive session.",
      traceId,
      idempotencyDisposition: "transient",
    };
  }

  const session: SessionRoute = setup.session;
  const execution = await executeGatewayReceiveTurn(
    {
      ...deps,
      session,
    },
    options,
  );

  const delivery = await deliverGatewayReceiveResponse({
    ...deps,
    session,
    response: execution.response,
    traceId,
    progressiveDelivery: execution.progressiveDelivery,
    progressiveFailure: execution.progressiveFailure,
  });

  const postDeliveryResults = await Promise.allSettled([
    Promise.resolve().then(() =>
      deps.context.services.hooks.emit("agent:end", {
        platform: deps.message.platform,
        userId: deps.message.userId,
        sessionId: session.sessionKey,
        response: execution.response,
      }),
    ),
    Promise.resolve().then(() => deps.snapshotState("receive", 20)),
  ]);
  for (const [index, result] of postDeliveryResults.entries()) {
    if (result.status !== "rejected") continue;
    deps.context.runtime.logger?.warn(
      {
        traceId,
        sessionId: session.sessionKey,
        phase: index === 0 ? "agent:end" : "snapshot",
        error: redactTrajectoryText(
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        ).slice(0, 500),
      },
      "Gateway post-delivery side effect failed",
    );
  }

  return {
    ok: delivery.status !== "rejected",
    response: execution.response,
    traceId,
    sessionId: setup.session.sessionKey,
    deliveryId: delivery.deliveryId,
    runSessionId: execution.runSessionId,
    agentCompleted: true,
    deliveryStatus: delivery.status,
    deliveryFailure: delivery.failureNote,
    outboxRecordId: delivery.outboxRecordId,
  };
}
