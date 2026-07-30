import type { NativeTelegramTransportService } from "@/runtime/native/service-bridge/runtime-contracts";
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
import {
  editNativeTelegramMessage,
  requireNativeTelegramService,
  sendNativeTelegramMessage,
} from "./native-transport";
import {
  isTelegramConfigured,
  TELEGRAM_CONFIGURED_DETAIL,
  TELEGRAM_MISSING_DETAIL,
  TELEGRAM_STARTED_DETAIL,
  TELEGRAM_STOP_DETAIL,
  TELEGRAM_STOPPED_DETAIL,
} from "./status";

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class TelegramPlatformAdapter implements PlatformAdapter {
  private readonly state: MessagingPlatformState;

  constructor(
    public readonly name: PlatformName,
    private readonly config: EnvConfig,
    private readonly delivery: DeliveryService,
    private readonly nativeBridge?: () =>
      | NativeMessagingTransportState
      | undefined,
    private readonly nativeService: () =>
      | NativeTelegramTransportService
      | undefined = () => undefined,
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
    const responseMetadata = await (async () => {
      try {
        const service = requireNativeTelegramService(this.nativeService);
        return await sendNativeTelegramMessage(service, message);
      } catch (error) {
        return this.state.fail(
          `Telegram native send failed: ${errorDetail(error)}`,
        );
      }
    })();

    return deliverMessagingRecord({
      delivery: this.delivery,
      message,
      name: this.name,
      platformLabel: "Telegram",
      responseMetadata,
      state: this.state,
    });
  }

  async edit(
    delivery: Awaited<ReturnType<TelegramPlatformAdapter["send"]>>,
    message: OutboundPlatformMessage,
  ) {
    const chatId = delivery.metadata?.platformRoomId ?? message.roomId;
    const telegramMessageId =
      delivery.metadata?.platformMessageId ?? message.replyToId;

    if (!chatId || !telegramMessageId) {
      throw new Error(
        "Telegram edit requires a stored platformRoomId and platformMessageId.",
      );
    }

    const responseMetadata = await (async () => {
      try {
        const service = requireNativeTelegramService(this.nativeService);
        return await editNativeTelegramMessage(service, {
          roomId: chatId,
          messageId: telegramMessageId,
          text: message.text,
          threadId: message.threadId ?? delivery.threadId,
        });
      } catch (error) {
        return this.state.fail(
          `Telegram native edit failed: ${errorDetail(error)}`,
        );
      }
    })();

    return editMessagingRecord({
      delivery: this.delivery,
      existingRecord: delivery,
      message,
      platformLabel: "Telegram",
      responseMetadata,
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
