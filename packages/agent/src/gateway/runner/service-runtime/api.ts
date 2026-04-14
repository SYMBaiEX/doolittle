import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "@/gateway/read/history-view";
import type {
  GatewayRunnerReadModel,
  GatewayRuntimeStatus,
} from "@/gateway/read/read-model";
import type {
  GatewayReceiveOptions,
  GatewayReceiveResult,
} from "@/gateway/receive/index";
import type { GatewayInboxReplayResult } from "@/gateway/receive/replay";
import type { GatewayRunnerControlPlane } from "@/gateway/runner/control-plane";
import type { GatewayRunnerOperations } from "@/gateway/runner/operations";
import type { GatewayRunnerRecording } from "@/gateway/runner/recording";
import type { GatewayRunnerStateBookkeeping } from "@/gateway/runner/state";
import type {
  GatewayHistorySnapshot,
  GatewayStateSnapshot,
  GatewayTransportDetail,
} from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  PlatformName,
} from "@/types/gateway";
import type { PlatformHealth } from "../../platforms/base";
import type {
  GatewayRunnerEditDeliveryOptions,
  GatewayRunnerProgressiveTarget,
  GatewayRunnerSendToHomesOptions,
  GatewayRunnerUpdateListener,
} from "./types";

export interface GatewayRunnerRuntimeApiDependencies {
  controlPlane: GatewayRunnerControlPlane;
  readModel: GatewayRunnerReadModel;
  recording: GatewayRunnerRecording;
  operations: GatewayRunnerOperations;
  stateBookkeeping: GatewayRunnerStateBookkeeping;
}

export interface GatewayRunnerRuntimeApi {
  control: {
    start(): Promise<void>;
    stop(): Promise<void>;
    heartbeat(reason?: string): Promise<GatewayStateSnapshot>;
    supervise(reason?: string): Promise<GatewaySupervisionRecord[]>;
    watchdog(reason?: string): Promise<GatewaySupervisionRecord[]>;
    watch(
      platform: PlatformName | "all",
      reason?: string,
    ): Promise<GatewaySupervisionRecord[]>;
    restart(
      platform: PlatformName | "all",
      reason?: string,
    ): Promise<GatewaySupervisionRecord[]>;
  };
  delivery: {
    receive(
      message: IncomingPlatformMessage,
      options?: GatewayReceiveOptions,
    ): Promise<GatewayReceiveResult>;
    sendToHomes(
      text: string,
      options?: GatewayRunnerSendToHomesOptions,
    ): Promise<DeliveredMessageRecord[]>;
    editDelivery(
      deliveryId: string,
      text: string,
      options?: GatewayRunnerEditDeliveryOptions,
    ): Promise<DeliveredMessageRecord>;
    sendProgressive(
      target: GatewayRunnerProgressiveTarget,
      parts: string[],
    ): Promise<DeliveredMessageRecord>;
  };
  read: {
    runtimeStatus(): GatewayRuntimeStatus;
    transport(platform: PlatformName): Promise<GatewayTransportDetail>;
    transportOverview(): Promise<{
      details: GatewayTransportDetail[];
      mismatchCount: number;
      operationalCount: number;
    }>;
    health(): Promise<Array<PlatformHealth>>;
    trace(limit?: number, filters?: GatewayHistoryFilter): GatewayTraceRecord[];
    state(
      limit?: number,
      filters?: GatewayHistoryFilter,
    ): Promise<GatewayStateSnapshot>;
    history(
      limit?: number,
      filters?: GatewayHistoryFilter,
    ): Promise<GatewayHistorySnapshot>;
    inbox(limit?: number, filters?: GatewayHistoryFilter): GatewayInboxRecord[];
    outbox(
      limit?: number,
      filters?: GatewayHistoryFilter,
    ): GatewayOutboxRecord[];
    attachments(
      limit?: number,
      filters?: GatewayHistoryFilter,
    ): GatewayAttachmentRecord[];
    supervision(limit?: number): GatewaySupervisionRecord[];
    replayInbox(recordId: string): Promise<GatewayInboxReplayResult>;
  };
  recording: {
    snapshotState(
      reason: string,
      limit?: number,
      filters?: GatewayHistoryFilter,
    ): Promise<GatewayHistorySnapshot>;
    onUpdate(listener: GatewayRunnerUpdateListener): () => void;
  };
}

export function createGatewayRunnerRuntimeApi({
  controlPlane,
  readModel,
  recording,
  operations,
  stateBookkeeping,
}: GatewayRunnerRuntimeApiDependencies): GatewayRunnerRuntimeApi {
  return {
    control: {
      start: () => controlPlane.start(),
      stop: () => controlPlane.stop(),
      heartbeat: (reason = "heartbeat") => controlPlane.heartbeat(reason),
      supervise: (reason = "manual") => controlPlane.supervise(reason),
      watchdog: (reason = "watchdog") => controlPlane.watchdog(reason),
      watch: (platform, reason = "manual-watch") =>
        controlPlane.watch(platform, reason),
      restart: (platform, reason = "manual") =>
        controlPlane.restart(platform, reason),
    },
    delivery: {
      receive: (message, options) => operations.receive(message, options),
      sendToHomes: (text, options) => operations.sendToHomes(text, options),
      editDelivery: (deliveryId, text, options) =>
        operations.editDelivery(deliveryId, text, options),
      sendProgressive: (target, parts) =>
        operations.sendProgressive(target, parts),
    },
    read: {
      runtimeStatus: () => readModel.runtimeStatus(),
      transport: (platform) => readModel.transport(platform),
      transportOverview: () => readModel.transportOverview(),
      health: () => readModel.health(),
      trace: (limit = 20, filters) => readModel.trace(limit, filters),
      state: (limit = 20, filters) => readModel.state(limit, filters),
      history: (limit = 20, filters) => readModel.history(limit, filters),
      inbox: (limit = 20, filters) => readModel.inbox(limit, filters),
      outbox: (limit = 20, filters) => readModel.outbox(limit, filters),
      attachments: (limit = 20, filters) =>
        readModel.attachments(limit, filters),
      supervision: (limit = 20) => readModel.supervision(limit),
      replayInbox: (recordId) => readModel.replayInbox(recordId),
    },
    recording: {
      snapshotState: (reason, limit = 20, filters) =>
        stateBookkeeping.snapshotState(reason, limit, filters),
      onUpdate: (listener) => recording.onUpdate(listener),
    },
  };
}
