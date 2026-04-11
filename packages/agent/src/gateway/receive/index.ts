import { randomUUID } from "node:crypto";

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

  const deliveryId = await deliverGatewayReceiveResponse({
    ...deps,
    session,
    response: execution.response,
    traceId,
    progressiveDelivery: execution.progressiveDelivery,
  });

  await deps.context.services.hooks.emit("agent:end", {
    platform: deps.message.platform,
    userId: deps.message.userId,
    sessionId: setup.session.sessionKey,
    response: execution.response,
  });

  await deps.snapshotState("receive", 20);

  return {
    ok: true,
    response: execution.response,
    traceId,
    sessionId: setup.session.sessionKey,
    deliveryId,
    runSessionId: execution.runSessionId,
  };
}
