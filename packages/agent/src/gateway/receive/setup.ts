import { loadGatewayConfig } from "@/config/gateway";
import { authorizeMessage } from "@/gateway/authorization";
import type { SessionRoute } from "@/types/gateway";
import type { GatewayReceiveDependencies, GatewayReceiveResult } from "./types";

export interface GatewayReceiveSetupResult {
  traceId: string;
  metadataKeys: string[];
  sessionKey?: string;
  response?: GatewayReceiveResult;
  session?: SessionRoute;
}

export async function setupGatewayReceive(
  deps: GatewayReceiveDependencies & {
    traceId: string;
    at: () => string;
    metadataKeys: string[];
  },
): Promise<GatewayReceiveSetupResult> {
  deps.pushTrace({
    traceId: deps.traceId,
    at: deps.at(),
    kind: "receive",
    platform: deps.message.platform,
    detail: `Inbound message received for ${deps.message.platform}.`,
    userId: deps.message.userId,
    roomId: deps.message.roomId,
    messageId: deps.message.messageId,
    threadId: deps.message.threadId,
    replyToMessageId: deps.message.replyToMessageId,
    metadataKeys: deps.metadataKeys,
  });
  await deps.observeAdapter(deps.message.platform, {
    at: deps.at(),
    kind: "receive",
    detail: `Inbound message received for ${deps.message.platform} with metadata keys ${deps.metadataKeys.join(",") || "none"}.`,
  });

  if (deps.adapter && !deps.adapter.canReceive()) {
    deps.recordInbox(deps.message, deps.traceId, undefined, "rejected", [
      `${deps.message.platform} transport is not ready for inbound traffic.`,
    ]);
    deps.pushTrace({
      traceId: deps.traceId,
      at: deps.at(),
      kind: "reject",
      platform: deps.message.platform,
      detail: `${deps.message.platform} transport is not ready for inbound traffic.`,
      userId: deps.message.userId,
      roomId: deps.message.roomId,
    });
    await deps.observeAdapter(deps.message.platform, {
      at: deps.at(),
      kind: "reject",
      detail: `${deps.message.platform} transport is not ready for inbound traffic.`,
    });
    return {
      traceId: deps.traceId,
      metadataKeys: deps.metadataKeys,
      response: {
        ok: false,
        response: `${deps.message.platform} transport is not ready for inbound traffic.`,
        traceId: deps.traceId,
      },
    };
  }

  const gatewayConfig = loadGatewayConfig(deps.context.config);
  const auth = authorizeMessage(
    deps.message,
    gatewayConfig,
    deps.context.services.pairing,
  );
  if (!auth.allowed) {
    const response = auth.pairingCode
      ? `Authorization required. Pairing code: ${auth.pairingCode}`
      : (auth.reason ?? "Unauthorized");
    deps.recordInbox(deps.message, deps.traceId, undefined, "rejected", [
      auth.reason ?? "Authorization failed.",
    ]);
    deps.pushTrace({
      traceId: deps.traceId,
      at: deps.at(),
      kind: "authorize",
      platform: deps.message.platform,
      detail: `Authorization failed for ${deps.message.platform}: ${auth.reason ?? "unauthorized"}.`,
      userId: deps.message.userId,
      roomId: deps.message.roomId,
    });
    await deps.observeAdapter(deps.message.platform, {
      at: deps.at(),
      kind: "reject",
      detail: `Authorization failed for ${deps.message.platform}: ${auth.reason ?? "unauthorized"}.`,
    });

    await deps.context.services.hooks.emit("gateway:unauthorized", {
      platform: deps.message.platform,
      userId: deps.message.userId,
      pairingCode: auth.pairingCode ?? "",
    });
    return {
      traceId: deps.traceId,
      metadataKeys: deps.metadataKeys,
      response: {
        ok: false,
        response,
        pairingCode: auth.pairingCode,
        traceId: deps.traceId,
      },
    };
  }

  const session = deps.context.services.gatewaySessions.resolve(deps.message);
  deps.pushTrace({
    traceId: deps.traceId,
    at: deps.at(),
    kind: "authorize",
    platform: deps.message.platform,
    detail: `Authorization succeeded for ${deps.message.platform}.`,
    sessionId: session.sessionKey,
    userId: deps.message.userId,
    roomId: deps.message.roomId,
    messageId: deps.message.messageId,
    threadId: deps.message.threadId,
    replyToMessageId: deps.message.replyToMessageId,
    metadataKeys: Object.keys(session.metadata ?? {}),
  });
  deps.pushTrace({
    traceId: deps.traceId,
    at: deps.at(),
    kind: "session",
    platform: deps.message.platform,
    detail: `Session resolved to ${session.sessionKey}.`,
    sessionId: session.sessionKey,
    userId: deps.message.userId,
    roomId: deps.message.roomId,
    messageId: deps.message.messageId,
    threadId: deps.message.threadId,
    replyToMessageId: deps.message.replyToMessageId,
    metadataKeys: Object.keys(session.metadata ?? {}),
  });
  await deps.observeAdapter(deps.message.platform, {
    at: deps.at(),
    kind: "authorize",
    detail: `${deps.message.platform} authorization succeeded for session ${session.sessionKey}.`,
  });
  deps.pushTrace({
    traceId: deps.traceId,
    at: deps.at(),
    kind: "route",
    platform: deps.message.platform,
    detail: `Inbound ${deps.message.platform} traffic routed to session ${session.sessionKey}.`,
    sessionId: session.sessionKey,
    userId: deps.message.userId,
    roomId: deps.message.roomId,
    messageId: deps.message.messageId,
    threadId: deps.message.threadId,
    replyToMessageId: deps.message.replyToMessageId,
    metadataKeys: Object.keys(session.metadata ?? {}),
  });
  await deps.observeAdapter(deps.message.platform, {
    at: deps.at(),
    kind: "route",
    detail: `Inbound ${deps.message.platform} traffic routed to session ${session.sessionKey}.`,
  });
  deps.recordInbox(deps.message, deps.traceId, session.sessionKey, "accepted");
  await deps.context.services.hooks.emit("session:start", {
    platform: deps.message.platform,
    userId: deps.message.userId,
    sessionId: session.sessionKey,
  });

  return {
    traceId: deps.traceId,
    metadataKeys: deps.metadataKeys,
    sessionKey: session.sessionKey,
    session,
  };
}
