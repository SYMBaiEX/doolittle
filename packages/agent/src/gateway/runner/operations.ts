import {
  buildGatewayOutboundForSession,
  buildGatewayOutboundMessageFromDelivery,
} from "@/gateway/outbound/builders";
import {
  editDeliveryOutbound,
  type GatewayEditDeliveryDependencies,
  type GatewayProgressiveDeliveryDependencies,
  type GatewaySendToHomesDependencies,
  sendProgressiveOutbound,
  sendToHomesOutbound,
} from "@/gateway/outbound/dispatch";
import type {
  GatewayReceiveOptions,
  GatewayReceiveResult,
} from "@/gateway/receive/index";
import { processGatewayReceive } from "@/gateway/receive/index";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type { GatewayRunnerRecording } from "@/gateway/runner/recording";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  PlatformName,
} from "@/types/gateway";
import type {
  PlatformAdapter,
  PlatformLifecycleEvent,
} from "../platforms/base";

export interface GatewayRunnerOperationDependencies {
  context: GatewayRunnerContext;
  adapters: Map<PlatformName, PlatformAdapter>;
  recording: GatewayRunnerRecording;
  snapshotState: (reason: string, limit?: number) => Promise<unknown>;
  observeAdapter: (
    platform: PlatformName,
    event: PlatformLifecycleEvent,
  ) => Promise<void>;
  getOutboxSessionIdByDeliveryId: (deliveryId: string) => string | undefined;
}

export interface GatewayRunnerOperations {
  observeAdapter(
    platform: PlatformName,
    event: PlatformLifecycleEvent,
  ): Promise<void>;
  receive(
    message: IncomingPlatformMessage,
    options?: GatewayReceiveOptions,
  ): Promise<GatewayReceiveResult>;
  sendToHomes(
    text: string,
    options?: {
      metadata?: Record<string, string>;
      platforms?: PlatformName[];
      name?: string;
    },
  ): Promise<DeliveredMessageRecord[]>;
  editDelivery(
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ): Promise<DeliveredMessageRecord>;
  sendProgressive(
    target: {
      platform: PlatformName;
      roomId: string;
      userId?: string;
      threadId?: string;
      replyToId?: string;
      metadata?: Record<string, string>;
    },
    parts: string[],
  ): Promise<DeliveredMessageRecord>;
}

export function createGatewayRunnerOperations(
  deps: GatewayRunnerOperationDependencies,
): GatewayRunnerOperations {
  const editDelivery = (
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ): Promise<DeliveredMessageRecord> => {
    const editDependencies: GatewayEditDeliveryDependencies = {
      getDelivery: (id) => deps.context.services.delivery.get(id),
      getOutboxSessionIdByDeliveryId: deps.getOutboxSessionIdByDeliveryId,
      getAdapter: (platform) => deps.adapters.get(platform),
      buildOutboundFromDelivery: (delivery, outboundText, outboundOptions) =>
        buildGatewayOutboundMessageFromDelivery(delivery, outboundText, {
          metadata: outboundOptions?.metadata,
          threadId: outboundOptions?.threadId,
          replyToId: outboundOptions?.replyToId,
        }),
      fallbackUpdate: (id, updateText, updateOptions) =>
        Promise.resolve(
          deps.context.services.delivery.update(id, updateText, {
            metadata: updateOptions?.metadata,
            threadId: updateOptions?.threadId,
            replyToId: updateOptions?.replyToId,
          }),
        ),
      recordOutbox: deps.recording.recordOutbox.bind(deps.recording),
      pushTrace: deps.recording.pushTrace.bind(deps.recording),
      observeAdapter: deps.observeAdapter,
      snapshotState: (reason, limit) =>
        deps.snapshotState(reason, limit) as Promise<unknown>,
    };

    return editDeliveryOutbound(deliveryId, text, options, editDependencies);
  };

  return {
    observeAdapter: deps.observeAdapter,
    receive: (message, options) =>
      processGatewayReceive(
        {
          context: deps.context,
          message,
          adapter: deps.adapters.get(message.platform),
          recordInbox: deps.recording.recordInbox.bind(deps.recording),
          recordOutbox: deps.recording.recordOutbox.bind(deps.recording),
          pushTrace: deps.recording.pushTrace.bind(deps.recording),
          observeAdapter: deps.observeAdapter,
          editDelivery,
          snapshotState: (reason, limit) =>
            deps.snapshotState(reason, limit) as Promise<unknown>,
        },
        options,
      ),
    sendToHomes: (text, options) => {
      const sendDeps: GatewaySendToHomesDependencies = {
        listHomeSessions: (platformFilters) =>
          deps.context.services.gatewaySessions
            .list()
            .filter(
              (session) =>
                session.isHome &&
                (!platformFilters || platformFilters.has(session.platform)) &&
                (session.channelId ?? session.roomId),
            ),
        buildOutboundForSession: (session, outbound, speechName) =>
          buildGatewayOutboundForSession(
            deps.context.services.media,
            session,
            outbound,
            speechName,
          ),
        getAdapter: (platform) => deps.adapters.get(platform),
        fallbackDeliver: (target, text, extras) =>
          deps.context.services.delivery.deliver(target, text, extras),
        recordOutbox: deps.recording.recordOutbox.bind(deps.recording),
        pushTrace: deps.recording.pushTrace.bind(deps.recording),
      };
      return sendToHomesOutbound(text, options, sendDeps);
    },
    editDelivery,
    sendProgressive: (target, parts) => {
      const depsProgressive: GatewayProgressiveDeliveryDependencies = {
        getAdapter: (platform) => deps.adapters.get(platform),
        fallbackDeliver: (targetDelivery, text, extras) =>
          deps.context.services.delivery.deliver(targetDelivery, text, extras),
        recordOutbox: deps.recording.recordOutbox.bind(deps.recording),
        pushTrace: deps.recording.pushTrace.bind(deps.recording),
        editDelivery: (deliveryId, text, options) =>
          editDelivery(deliveryId, text, options),
      };
      return sendProgressiveOutbound(target, parts, depsProgressive);
    },
  };
}
