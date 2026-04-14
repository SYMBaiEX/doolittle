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
import { parseTelegramResponse } from "./response";
import { editTelegramMessage, sendTelegramMessage } from "./send";
import {
  getTelegramApiRoot,
  isTelegramConfigured,
  requireTelegramBotToken,
  TELEGRAM_CONFIGURED_DETAIL,
  TELEGRAM_MISSING_DETAIL,
  TELEGRAM_STARTED_DETAIL,
  TELEGRAM_STOP_DETAIL,
  TELEGRAM_STOPPED_DETAIL,
} from "./status";

export class TelegramPlatformAdapter implements PlatformAdapter {
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
      configured: isTelegramConfigured(this.config),
      startedDetail: TELEGRAM_STARTED_DETAIL,
      missingDetail: TELEGRAM_MISSING_DETAIL,
    });
  }

  async stop(): Promise<void> {
    this.state.stop(TELEGRAM_STOPPED_DETAIL);
  }

  async health() {
    const bridge = this.nativeBridge?.();

    return this.state.health({
      configured: isTelegramConfigured(this.config),
      canReceive: this.canReceive(),
      configuredDetail: TELEGRAM_CONFIGURED_DETAIL,
      missingDetail: TELEGRAM_MISSING_DETAIL,
      runningDetail: buildMessagingRunningDetail(
        this.state,
        TELEGRAM_CONFIGURED_DETAIL,
        bridge,
      ),
      stoppedDetail: TELEGRAM_STOP_DETAIL,
      bridge,
    });
  }

  async send(message: OutboundPlatformMessage) {
    const botToken = requireTelegramBotToken(this.config, this.state);
    const { response, bodyText } = await sendTelegramMessage(
      getTelegramApiRoot(this.config),
      botToken,
      message,
    );

    if (!response.ok) {
      this.state.fail(`Telegram send failed (${response.status}): ${bodyText}`);
    }

    return deliverMessagingRecord({
      delivery: this.delivery,
      message,
      name: this.name,
      platformLabel: "Telegram",
      responseMetadata: parseTelegramResponse(bodyText),
      state: this.state,
    });
  }

  async edit(
    delivery: Awaited<ReturnType<TelegramPlatformAdapter["send"]>>,
    message: OutboundPlatformMessage,
  ) {
    const botToken = requireTelegramBotToken(this.config, this.state);
    const chatId = delivery.metadata?.platformRoomId ?? message.roomId;
    const telegramMessageId =
      delivery.metadata?.platformMessageId ?? message.replyToId;

    if (!chatId || !telegramMessageId) {
      throw new Error(
        "Telegram edit requires a stored platformRoomId and platformMessageId.",
      );
    }

    const { response, bodyText } = await editTelegramMessage(
      getTelegramApiRoot(this.config),
      botToken,
      chatId,
      telegramMessageId,
      message.text,
    );

    if (!response.ok) {
      this.state.fail(`Telegram edit failed (${response.status}): ${bodyText}`);
    }

    return editMessagingRecord({
      delivery: this.delivery,
      existingRecord: delivery,
      message,
      platformLabel: "Telegram",
      responseMetadata: parseTelegramResponse(bodyText),
      state: this.state,
      locationLabel: message.roomId,
    });
  }

  canReceive(): boolean {
    return isTelegramConfigured(this.config);
  }

  observe(event: PlatformLifecycleEvent): void {
    this.state.observe(event);
  }
}
