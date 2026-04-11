import type { AppContext } from "@/runtime/bootstrap";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  SessionRoute,
} from "@/types/gateway";
import type { PlatformAdapter } from "../platforms/base";

type MediaService = AppContext["services"]["media"];

export function isVoiceMessage(message: IncomingPlatformMessage): boolean {
  const kinds = (message.metadata?.attachmentKinds ?? "")
    .split("|")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return kinds.some((kind) => kind === "voice" || kind === "audio");
}

export async function buildGatewayOutboundForSession(
  media: MediaService,
  session: SessionRoute,
  outbound: OutboundPlatformMessage,
  speechName: string,
): Promise<OutboundPlatformMessage> {
  const voiceMode = session.voiceMode ?? "off";
  if (voiceMode === "off") {
    return outbound;
  }

  try {
    const speech = await media.speak(outbound.text, {
      name: `${session.platform}-${speechName}`,
    });
    const attachmentName = speech.artifactPath.split("/").at(-1) ?? "speech";
    return {
      ...outbound,
      metadata: {
        ...(outbound.metadata ?? {}),
        voiceMode,
        audioAsVoice: "true",
        attachmentCount: "1",
        attachmentKinds: "voice",
        attachmentNames: attachmentName,
        attachmentUrls: speech.artifactPath,
        attachmentMimeTypes:
          speech.artifactKind === "mp3" ? "audio/mpeg" : "image/svg+xml",
      },
    };
  } catch {
    return {
      ...outbound,
      metadata: {
        ...(outbound.metadata ?? {}),
        voiceMode,
        audioAsVoice: "true",
      },
    };
  }
}

export async function buildGatewayOutboundResponse(
  media: MediaService,
  session: SessionRoute,
  message: IncomingPlatformMessage,
  outbound: OutboundPlatformMessage,
): Promise<OutboundPlatformMessage> {
  const voiceMode = session.voiceMode ?? "off";
  const shouldSpeak =
    voiceMode === "all" ||
    (voiceMode === "voice_only" && isVoiceMessage(message));
  if (!shouldSpeak) {
    return outbound;
  }
  return buildGatewayOutboundForSession(
    media,
    session,
    outbound,
    "voice-reply",
  );
}

export function buildGatewayOutboundMessageFromDelivery(
  delivery: DeliveredMessageRecord,
  text: string,
  options?: {
    metadata?: Record<string, string>;
    threadId?: string;
    replyToId?: string;
  },
): OutboundPlatformMessage {
  return {
    roomId: delivery.target.channelId ?? delivery.target.userId ?? "unknown",
    userId: delivery.target.userId,
    text,
    threadId: options?.threadId ?? delivery.threadId,
    replyToId: options?.replyToId ?? delivery.replyToId,
    metadata: {
      ...(delivery.metadata ?? {}),
      ...(options?.metadata ?? {}),
    },
  };
}

export function shouldUseFreshDelivery(
  metadata?: Record<string, string>,
): boolean {
  return (
    metadata?.audioAsVoice === "true" ||
    Number(metadata?.attachmentCount ?? "0") > 0
  );
}

export interface ProgressiveDeliveryQueue {
  queueProgressFlush(text: string, force?: boolean): Promise<void>;
  getProgressiveDelivery(): DeliveredMessageRecord | undefined;
}

export function createProgressiveDeliveryQueue(params: {
  adapter?: Pick<PlatformAdapter, "send">;
  message: IncomingPlatformMessage;
  session: SessionRoute;
  editDelivery: (
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ) => Promise<DeliveredMessageRecord>;
}): ProgressiveDeliveryQueue {
  let progressiveDelivery: DeliveredMessageRecord | undefined;
  let progressiveText = "";
  let lastProgressFlushAt = 0;
  let progressChain = Promise.resolve();

  const queueProgressFlush = (text: string, force = false): Promise<void> => {
    const adapter = params.adapter;
    if (!adapter || !text.trim()) {
      return progressChain;
    }

    progressChain = progressChain
      .then(async () => {
        const now = Date.now();
        if (
          !force &&
          progressiveDelivery &&
          now - lastProgressFlushAt < 250 &&
          text.length - progressiveText.length < 32
        ) {
          return;
        }

        const outbound: OutboundPlatformMessage = {
          roomId: params.message.channelId ?? params.message.roomId,
          userId: params.message.userId,
          text,
          threadId: params.message.threadId ?? params.session.threadId,
          replyToId:
            params.message.messageId ?? params.message.replyToMessageId,
          metadata: {
            ...(params.message.metadata ?? {}),
            progressive: "true",
          },
        };

        if (!progressiveDelivery) {
          progressiveDelivery = await adapter.send(outbound);
        } else {
          progressiveDelivery = await params.editDelivery(
            progressiveDelivery.id,
            text,
            {
              threadId: outbound.threadId,
              replyToId: outbound.replyToId,
              metadata: outbound.metadata,
            },
          );
        }
        progressiveText = text;
        lastProgressFlushAt = now;
      })
      .catch(() => undefined);
    return progressChain;
  };

  return {
    queueProgressFlush,
    getProgressiveDelivery: () => progressiveDelivery,
  };
}
