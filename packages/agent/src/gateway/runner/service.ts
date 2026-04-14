import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "@/gateway/read/history-view";
import type { GatewayRuntimeStatus } from "@/gateway/read/read-model";
import type {
  GatewayReceiveOptions,
  GatewayReceiveResult,
} from "@/gateway/receive/index";
import type { GatewayInboxReplayResult } from "@/gateway/receive/replay";
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
import type { PlatformHealth } from "../platforms/base";
import type { GatewayRunnerContext } from "./context";
import type { GatewayRunnerRuntimeApi } from "./service-runtime/api";
import { GatewayRunnerRuntimeState } from "./service-runtime/state";
import type {
  GatewayRunnerEditDeliveryOptions,
  GatewayRunnerProgressiveTarget,
  GatewayRunnerSendToHomesOptions,
  GatewayRunnerUpdateListener,
} from "./service-runtime/types";
import { wireGatewayRunnerRuntime } from "./service-runtime/wire";

export class GatewayRunner {
  private readonly api: GatewayRunnerRuntimeApi;

  constructor(context: GatewayRunnerContext) {
    const runtimeState = new GatewayRunnerRuntimeState();
    this.api = wireGatewayRunnerRuntime(context, runtimeState);
  }

  async start(): Promise<void> {
    await this.api.control.start();
  }

  async stop(): Promise<void> {
    await this.api.control.stop();
  }

  heartbeat(reason = "heartbeat"): Promise<GatewayStateSnapshot> {
    return this.api.control.heartbeat(reason);
  }

  runtimeStatus(): GatewayRuntimeStatus {
    return this.api.read.runtimeStatus();
  }

  async transport(platform: PlatformName): Promise<GatewayTransportDetail> {
    return this.api.read.transport(platform);
  }

  async transportOverview(): Promise<{
    details: GatewayTransportDetail[];
    mismatchCount: number;
    operationalCount: number;
  }> {
    return this.api.read.transportOverview();
  }

  supervise(reason = "manual"): Promise<GatewaySupervisionRecord[]> {
    return this.api.control.supervise(reason);
  }

  watchdog(reason = "watchdog"): Promise<GatewaySupervisionRecord[]> {
    return this.api.control.watchdog(reason);
  }

  watch(
    platform: PlatformName | "all",
    reason = "manual-watch",
  ): Promise<GatewaySupervisionRecord[]> {
    return this.api.control.watch(platform, reason);
  }

  restart(
    platform: PlatformName | "all",
    reason = "manual",
  ): Promise<GatewaySupervisionRecord[]> {
    return this.api.control.restart(platform, reason);
  }

  receive(
    message: IncomingPlatformMessage,
    options?: GatewayReceiveOptions,
  ): Promise<GatewayReceiveResult> {
    return this.api.delivery.receive(message, options);
  }

  sendToHomes(
    text: string,
    options?: GatewayRunnerSendToHomesOptions,
  ): Promise<DeliveredMessageRecord[]> {
    return this.api.delivery.sendToHomes(text, options);
  }

  editDelivery(
    deliveryId: string,
    text: string,
    options?: GatewayRunnerEditDeliveryOptions,
  ): Promise<DeliveredMessageRecord> {
    return this.api.delivery.editDelivery(deliveryId, text, options);
  }

  sendProgressive(
    target: GatewayRunnerProgressiveTarget,
    parts: string[],
  ): Promise<DeliveredMessageRecord> {
    return this.api.delivery.sendProgressive(target, parts);
  }

  health(): Promise<Array<PlatformHealth>> {
    return this.api.read.health();
  }

  trace(limit = 20, filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.api.read.trace(limit, filters);
  }

  state(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayStateSnapshot> {
    return this.api.read.state(limit, filters);
  }

  history(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayHistorySnapshot> {
    return this.api.read.history(limit, filters);
  }

  inbox(limit = 20, filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return this.api.read.inbox(limit, filters);
  }

  outbox(limit = 20, filters?: GatewayHistoryFilter): GatewayOutboxRecord[] {
    return this.api.read.outbox(limit, filters);
  }

  attachments(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return this.api.read.attachments(limit, filters);
  }

  supervision(limit = 20): GatewaySupervisionRecord[] {
    return this.api.read.supervision(limit);
  }

  replayInbox(recordId: string): Promise<GatewayInboxReplayResult> {
    return this.api.read.replayInbox(recordId);
  }

  onUpdate(listener: GatewayRunnerUpdateListener): () => void {
    return this.api.recording.onUpdate(listener);
  }
}

export type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "@/gateway/read/history-view";
export type { GatewayRuntimeStatus } from "@/gateway/read/read-model";
export type {
  GatewayHistorySnapshot,
  GatewayPlatformStateView,
  GatewayStateSnapshot,
  GatewayTransportDetail,
} from "@/gateway/state/state-snapshot";
