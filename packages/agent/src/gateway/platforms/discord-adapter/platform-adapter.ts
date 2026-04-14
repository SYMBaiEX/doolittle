import type { NativeMessagingTransportState } from "@/runtime/native/service-bridge/transport-control";
import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage, PlatformName } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import type { PlatformAdapter, PlatformLifecycleEvent } from "../base";
import {
  buildMessagingRunningDetail,
  deliverMessagingRecord,
  editMessagingRecord,
} from "../messaging-adapter-shared";
import { MessagingPlatformState } from "../messaging-state";
import { resolveVoiceAttachment } from "../messaging-utils";
import { buildDiscordEditPayload, buildDiscordPayload } from "./payload";
import { parseDiscordResponse } from "./response";
import { editDiscordMessage, sendDiscordMessage } from "./send";
import {
  DISCORD_CONFIGURED_DETAIL,
  DISCORD_MISSING_DETAIL,
  DISCORD_STARTED_DETAIL,
  DISCORD_STOP_DETAIL,
  DISCORD_STOPPED_DETAIL,
  isDiscordConfigured,
  requireDiscordBotToken,
} from "./status";

export class DiscordPlatformAdapter implements PlatformAdapter {
  private readonly state: MessagingPlatformState;

  constructor(
    public readonly name: PlatformName,
    private readonly config: EnvConfig,
    private readonly delivery: DeliveryService,
    private readonly nativeBridge?: () =>
      | NativeMessagingTransportState
      | undefined,
  ) {
    this.state = new MessagingPlatformState(name);
  }

  async start(): Promise<void> {
    this.state.start({
      configured: isDiscordConfigured(this.config),
      startedDetail: DISCORD_STARTED_DETAIL,
      missingDetail: DISCORD_MISSING_DETAIL,
    });
  }

  async stop(): Promise<void> {
    this.state.stop(DISCORD_STOPPED_DETAIL);
  }

  async health() {
    const bridge = this.nativeBridge?.();

    return this.state.health({
      configured: isDiscordConfigured(this.config),
      canReceive: this.canReceive(),
      configuredDetail: DISCORD_CONFIGURED_DETAIL,
      missingDetail: DISCORD_MISSING_DETAIL,
      runningDetail: buildMessagingRunningDetail(
        this.state,
        DISCORD_CONFIGURED_DETAIL,
        bridge,
      ),
      stoppedDetail: DISCORD_STOP_DETAIL,
      bridge,
    });
  }

  async send(message: OutboundPlatformMessage) {
    const botToken = requireDiscordBotToken(this.config, this.state);
    const payload = buildDiscordPayload(message);
    const voicePath = resolveVoiceAttachment(message.metadata);
    const { response, bodyText } = await sendDiscordMessage(
      botToken,
      message,
      payload,
      voicePath,
    );

    if (!response.ok) {
      this.state.fail(`Discord send failed (${response.status}): ${bodyText}`);
    }

    return deliverMessagingRecord({
      delivery: this.delivery,
      message,
      name: this.name,
      platformLabel: "Discord",
      responseMetadata: parseDiscordResponse(bodyText),
      state: this.state,
    });
  }

  async edit(
    delivery: Awaited<ReturnType<DiscordPlatformAdapter["send"]>>,
    message: OutboundPlatformMessage,
  ) {
    const botToken = requireDiscordBotToken(this.config, this.state);
    const channelId = delivery.metadata?.platformRoomId ?? message.roomId;
    const discordMessageId =
      delivery.metadata?.platformMessageId ?? message.replyToId;

    if (!channelId || !discordMessageId) {
      throw new Error(
        "Discord edit requires a stored platformRoomId and platformMessageId.",
      );
    }

    const { response, bodyText } = await editDiscordMessage(
      botToken,
      channelId,
      discordMessageId,
      buildDiscordEditPayload(message),
    );

    if (!response.ok) {
      this.state.fail(`Discord edit failed (${response.status}): ${bodyText}`);
    }

    return editMessagingRecord({
      delivery: this.delivery,
      existingRecord: delivery,
      message,
      platformLabel: "Discord",
      responseMetadata: parseDiscordResponse(bodyText),
      state: this.state,
      locationLabel: channelId,
    });
  }

  canReceive(): boolean {
    return isDiscordConfigured(this.config);
  }

  observe(event: PlatformLifecycleEvent): void {
    this.state.observe(event);
  }
}
