import { normalizeInboundMessage } from "@/gateway/message-normalization";
import type { GatewayRunner } from "@/gateway/runner";
import type { IncomingPlatformMessage } from "@/types/gateway";

const SIGNAL_SERVICE = "signal";
const HANDOFF_INSTALLED = Symbol.for(
  "doolittle.gateway.native-signal-inbound-handoff",
);

type SignalAttachment = {
  id?: string;
  filename?: string;
  contentType?: string;
  content_type?: string;
  size?: number;
};

export type NativeSignalMessage = {
  sender?: string;
  message?: string;
  timestamp?: number;
  groupId?: string;
  attachments?: SignalAttachment[];
  quote?: { id?: number; author?: string; text?: string };
  reaction?: unknown;
};

type SignalServiceLike = {
  runtime?: {
    getSetting?: (key: string) => unknown;
  };
  settings?: {
    shouldIgnoreGroupMessages?: boolean;
  };
  handleIncomingMessage?: (
    message: NativeSignalMessage,
    accountId?: string,
  ) => Promise<void>;
  sendMessage?: (
    recipient: string,
    text: string,
    options?: {
      accountId?: string;
      quote?: { timestamp: number; author: string };
    },
  ) => Promise<unknown>;
  sendGroupMessage?: (
    groupId: string,
    text: string,
    options?: {
      accountId?: string;
      quote?: { timestamp: number; author: string };
    },
  ) => Promise<unknown>;
  [HANDOFF_INSTALLED]?: boolean;
};

export interface NativeSignalInboundGateway {
  receive(message: IncomingPlatformMessage): Promise<{
    ok: boolean;
    response?: string;
    pairingCode?: string;
    agentCompleted?: boolean;
    deliveryStatus?: "sent" | "fallback" | "rejected";
  }>;
}

function shouldIgnoreSignalGroupMessage(
  service: SignalServiceLike,
  message: NativeSignalMessage,
): boolean {
  if (!message.groupId) return false;
  const configured = service.settings?.shouldIgnoreGroupMessages;
  if (configured !== undefined) return configured;
  const runtimeSetting = service.runtime?.getSetting?.(
    "SIGNAL_SHOULD_IGNORE_GROUP_MESSAGES",
  );
  return runtimeSetting === true || runtimeSetting === "true";
}

function attachmentMetadata(
  attachments: SignalAttachment[],
): Record<string, string> {
  const valid = attachments.filter((attachment) =>
    Boolean(
      attachment.id ||
        attachment.filename ||
        attachment.contentType ||
        attachment.content_type,
    ),
  );
  if (valid.length === 0) return {};
  const values = (
    value: (attachment: SignalAttachment) => string | undefined,
  ) =>
    valid
      .map(value)
      .filter((entry): entry is string => Boolean(entry))
      .join("|");
  return {
    attachmentCount: String(valid.length),
    ...(values((attachment) => attachment.filename ?? attachment.id)
      ? {
          attachmentNames: values(
            (attachment) => attachment.filename ?? attachment.id,
          ),
        }
      : {}),
    ...(values(
      (attachment) => attachment.contentType ?? attachment.content_type,
    )
      ? {
          attachmentMimeTypes: values(
            (attachment) => attachment.contentType ?? attachment.content_type,
          ),
        }
      : {}),
    ...(values((attachment) =>
      attachment.size === undefined ? undefined : String(attachment.size),
    )
      ? {
          attachmentSizes: values((attachment) =>
            attachment.size === undefined ? undefined : String(attachment.size),
          ),
        }
      : {}),
    ...(values((attachment) => attachment.id)
      ? { attachmentIds: values((attachment) => attachment.id) }
      : {}),
  };
}

/** Normalize the concrete beta.7 SignalService callback payload. */
export function normalizeNativeSignalMessage(
  message: NativeSignalMessage,
  accountId?: string,
): IncomingPlatformMessage | null {
  if (
    !message ||
    message.reaction ||
    typeof message.sender !== "string" ||
    message.sender.length === 0 ||
    typeof message.timestamp !== "number"
  ) {
    return null;
  }
  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : [];
  const hasText =
    typeof message.message === "string" && message.message.length > 0;
  const hasAttachment = attachments.some((attachment) =>
    Boolean(
      attachment?.id ||
        attachment?.filename ||
        attachment?.contentType ||
        attachment?.content_type,
    ),
  );
  if (!hasText && !hasAttachment) return null;

  const messageId = String(message.timestamp);
  const roomId = message.groupId || message.sender;
  const normalized = normalizeInboundMessage("signal", {
    sender: message.sender,
    message: hasText ? message.message : "[Signal attachment]",
    conversation_id: roomId,
    message_id: messageId,
    timestamp: String(message.timestamp),
    reply_to:
      message.quote?.id === undefined ? undefined : String(message.quote.id),
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename ?? attachment.id,
      content_type: attachment.contentType ?? attachment.content_type,
      // The shared parser requires a media locator; Signal's native callback
      // exposes attachment IDs, which are retained separately below.
      data: attachment.id ? `signal://attachment/${attachment.id}` : undefined,
      size: attachment.size,
    })),
  });
  if (!normalized) return null;
  return {
    ...normalized,
    ...(message.groupId ? { channelType: "group" } : { channelType: "dm" }),
    metadata: {
      ...(normalized.metadata ?? {}),
      nativeConnector: "signal",
      messageId,
      timestamp: String(message.timestamp),
      ...(message.groupId ? { groupId: message.groupId } : {}),
      ...(message.quote?.id !== undefined
        ? { quoteId: String(message.quote.id) }
        : {}),
      ...(message.quote?.author ? { quoteAuthor: message.quote.author } : {}),
      ...(accountId ? { accountId } : {}),
      ...attachmentMetadata(attachments),
    },
  };
}

/** Bridge Signal polling/event-stream callbacks into the shared gateway. */
export function installNativeSignalInboundHandoff(
  runtime: { getService: (serviceType: string) => unknown },
  gateway: NativeSignalInboundGateway | GatewayRunner,
): boolean {
  const service = runtime.getService(
    SIGNAL_SERVICE,
  ) as SignalServiceLike | null;
  if (!service?.handleIncomingMessage || service[HANDOFF_INSTALLED])
    return false;

  service.handleIncomingMessage = async function (message, accountId) {
    if (shouldIgnoreSignalGroupMessage(this, message)) return;
    const inbound = normalizeNativeSignalMessage(message, accountId);
    if (!inbound) return;
    const result = await gateway.receive(inbound);
    if (result.ok || result.agentCompleted || !result.response?.trim()) return;

    const timestamp = Number(inbound.messageId);
    const options = {
      ...(accountId ? { accountId } : {}),
      ...(Number.isFinite(timestamp)
        ? { quote: { timestamp, author: inbound.userId } }
        : {}),
    };
    if (message.groupId) {
      // beta.7's public group-send signature accepts `quote`, but its pinned
      // client drops that option. A pairing or authorization response can
      // contain a secret, so never fall back to an unquoted group send.
      // Direct send forwards the account and quote to Signal; this is a
      // private response to the sender, not a native reply in the group.
      await this.sendMessage?.(inbound.userId, result.response, options);
      return;
    }
    await this.sendMessage?.(inbound.roomId, result.response, options);
  };
  Object.defineProperty(service, HANDOFF_INSTALLED, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return true;
}
