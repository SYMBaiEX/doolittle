import type {
  Content,
  IAgentRuntime,
  Media,
  MessageConnector,
  TargetInfo,
} from "@elizaos/core";
import type { DeliveryService } from "@/services/delivery-service";
import type {
  DeliveredMessageRecord,
  OutboundPlatformMessage,
  PlatformName,
} from "@/types/gateway";
import type { PlatformAdapter } from "./base";
import { capabilitiesForPlatform } from "./base";
import { resolveVoiceAttachment } from "./messaging-utils";

function connectorFor(
  runtime: IAgentRuntime,
  source: string,
): MessageConnector | undefined {
  return runtime
    .getMessageConnectors()
    .find(
      (connector) =>
        connector.source === source &&
        connector.capabilities.includes("send_message"),
    );
}

function nativeTarget(
  platform: PlatformName,
  message: OutboundPlatformMessage,
): TargetInfo {
  return {
    source: platform,
    channelId: message.roomId,
    threadId: message.threadId,
  };
}

function nativeContent(message: OutboundPlatformMessage): Content {
  const voicePath = resolveVoiceAttachment(message.metadata);
  const attachments: Media[] | undefined = voicePath
    ? [
        {
          id: voicePath,
          url: voicePath,
          source: "doolittle",
          mimeType: "audio/ogg",
        },
      ]
    : undefined;
  return {
    text: message.text,
    source: "doolittle",
    ...(attachments ? { attachments } : {}),
    ...(message.replyToId
      ? { replyToExternalMessageId: message.replyToId }
      : {}),
  };
}

function memoryMetadata(
  memory: Awaited<ReturnType<IAgentRuntime["sendMessageToTarget"]>>,
): Record<string, string> {
  const metadata = memory?.metadata;
  if (!metadata || typeof metadata !== "object") return {};
  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
}

export class NativeMessageConnectorAdapter implements PlatformAdapter {
  readonly edit?: PlatformAdapter["edit"];

  constructor(
    public readonly name: PlatformName,
    private readonly runtime: IAgentRuntime,
    private readonly delivery: DeliveryService,
  ) {
    const connector = connectorFor(runtime, name);
    if (
      connector?.capabilities.includes("edit_message") &&
      connector.editHandler
    ) {
      this.edit = async (delivery, message) => {
        const externalMessageId =
          delivery.metadata?.platformMessageId ??
          delivery.metadata?.externalMessageId ??
          delivery.metadata?.messageIdFull;
        if (!externalMessageId) {
          throw new Error(
            `${name} edit requires an external message identifier.`,
          );
        }
        const memory = await runtime.editMessageOnTarget(
          nativeTarget(name, message),
          externalMessageId,
          nativeContent(message),
        );
        return this.delivery.update(delivery.id, message.text, {
          threadId: message.threadId,
          replyToId: message.replyToId,
          metadata: { ...(message.metadata ?? {}), ...memoryMetadata(memory) },
        });
      };
    }
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async health() {
    const connector = connectorFor(this.runtime, this.name);
    return {
      platform: this.name,
      status: "running" as const,
      ready: Boolean(connector),
      mode: "native" as const,
      capabilities: {
        ...capabilitiesForPlatform(this.name),
        edits: Boolean(this.edit),
      },
      detail: connector
        ? `${connector.label} message connector is registered.`
        : `${this.name} message connector is not registered.`,
      events: [],
    };
  }

  async send(
    message: OutboundPlatformMessage,
  ): Promise<DeliveredMessageRecord> {
    if (!connectorFor(this.runtime, this.name)) {
      throw new Error(`${this.name} message connector is not registered.`);
    }
    const memory = await this.runtime.sendMessageToTarget(
      nativeTarget(this.name, message),
      nativeContent(message),
    );
    return this.delivery.deliver(
      {
        platform: this.name,
        channelId: message.roomId,
        userId: message.userId,
        mode: "explicit",
      },
      message.text,
      {
        threadId: message.threadId,
        replyToId: message.replyToId,
        metadata: { ...(message.metadata ?? {}), ...memoryMetadata(memory) },
      },
    );
  }

  canReceive(): boolean {
    return Boolean(connectorFor(this.runtime, this.name));
  }
}

export function hasNativeMessageConnector(
  runtime: IAgentRuntime,
  platform: PlatformName,
): boolean {
  return Boolean(connectorFor(runtime, platform));
}
