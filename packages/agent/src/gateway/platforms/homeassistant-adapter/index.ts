import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage, PlatformName } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import type {
  PlatformAdapter,
  PlatformHealth,
  PlatformLifecycleEvent,
} from "../base";
import { MessagingPlatformState } from "../messaging-state";
import {
  requireHomeAssistantConfig,
  sendHomeAssistantNotification,
  watchHomeAssistantStates,
} from "./requests";
import {
  HOMEASSISTANT_CONFIGURED_DETAIL,
  HOMEASSISTANT_MISSING_DETAIL,
  HOMEASSISTANT_STARTED_DETAIL,
  HOMEASSISTANT_STOPPED_DETAIL,
} from "./shared";
import {
  applyHomeAssistantWatchHealth,
  createHomeAssistantWatchState,
  recordHomeAssistantWatch,
} from "./watch-state";

export class HomeAssistantPlatformAdapter implements PlatformAdapter {
  private readonly state: MessagingPlatformState;
  private readonly watchState = createHomeAssistantWatchState();

  constructor(
    public readonly name: PlatformName,
    private readonly config: EnvConfig,
    private readonly delivery: DeliveryService,
  ) {
    this.state = new MessagingPlatformState(name);
  }

  async start(): Promise<void> {
    this.state.start({
      configured: this.canReceive(),
      startedDetail: HOMEASSISTANT_STARTED_DETAIL,
      missingDetail: HOMEASSISTANT_MISSING_DETAIL,
    });
  }

  async stop(): Promise<void> {
    this.state.stop("Home Assistant adapter stopped.");
  }

  async watch(reason = "watch"): Promise<{
    watchedAt: string;
    count: number;
    summary: string;
  }> {
    const connection = requireHomeAssistantConfig(
      this.config,
      HOMEASSISTANT_MISSING_DETAIL,
      (detail) => this.state.fail(detail),
    );
    let result: Awaited<ReturnType<typeof watchHomeAssistantStates>>;
    try {
      result = await watchHomeAssistantStates(connection);
    } catch (error) {
      this.state.fail(error instanceof Error ? error.message : String(error));
    }
    recordHomeAssistantWatch(this.watchState, result);
    this.state.observe({
      at: result.watchedAt,
      kind: "heartbeat",
      detail: `Home Assistant watch cycle (${reason}) observed ${result.count} entities.`,
    });
    return result;
  }

  async health(): Promise<PlatformHealth> {
    const health = this.state.health({
      configured: this.canReceive(),
      canReceive: this.canReceive(),
      configuredDetail: HOMEASSISTANT_CONFIGURED_DETAIL(this.config),
      missingDetail: HOMEASSISTANT_MISSING_DETAIL,
      runningDetail: `${HOMEASSISTANT_CONFIGURED_DETAIL(this.config)} Sends=${this.state.getSendCount()}.`,
      stoppedDetail: HOMEASSISTANT_STOPPED_DETAIL,
    });
    return applyHomeAssistantWatchHealth(health, this.watchState);
  }

  async send(message: OutboundPlatformMessage) {
    const connection = requireHomeAssistantConfig(
      this.config,
      HOMEASSISTANT_MISSING_DETAIL,
      (detail) => this.state.fail(detail),
    );
    const response = await sendHomeAssistantNotification(
      connection,
      this.name,
      message,
    );
    if (!response.ok) {
      this.state.fail(
        `Home Assistant send failed (${response.status}): ${await response.text()}`,
      );
    }

    const record = this.delivery.deliver(
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
        metadata: message.metadata,
      },
    );
    this.state.recordDelivery({
      kind: "deliver",
      message,
      record,
      detail: `Home Assistant delivery ${record.id} to ${message.roomId}.`,
    });
    return record;
  }

  canReceive(): boolean {
    return Boolean(
      this.config.homeAssistantUrl && this.config.homeAssistantToken,
    );
  }

  observe(event: PlatformLifecycleEvent): void {
    this.state.observe(event);
  }
}
