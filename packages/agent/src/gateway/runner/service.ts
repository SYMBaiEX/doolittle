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
import { GatewayRunnerRuntime } from "./service-runtime";

export class GatewayRunner {
  private readonly runtime: GatewayRunnerRuntime;

  constructor(context: GatewayRunnerContext) {
    this.runtime = new GatewayRunnerRuntime(context);
  }

  start(): Promise<void> {
    return this.runtime.start();
  }

  stop(): Promise<void> {
    return this.runtime.stop();
  }

  heartbeat(reason = "heartbeat"): Promise<GatewayStateSnapshot> {
    return this.runtime.heartbeat(reason);
  }

  runtimeStatus(): GatewayRuntimeStatus {
    return this.runtime.runtimeStatus();
  }

  async transport(platform: PlatformName): Promise<GatewayTransportDetail> {
    return this.runtime.transport(platform);
  }

  async transportOverview(): Promise<{
    details: GatewayTransportDetail[];
    mismatchCount: number;
    operationalCount: number;
  }> {
    return this.runtime.transportOverview();
  }

  supervise(reason = "manual"): Promise<GatewaySupervisionRecord[]> {
    return this.runtime.supervise(reason);
  }

  watchdog(reason = "watchdog"): Promise<GatewaySupervisionRecord[]> {
    return this.runtime.watchdog(reason);
  }

  watch(
    platform: PlatformName | "all",
    reason = "manual-watch",
  ): Promise<GatewaySupervisionRecord[]> {
    return this.runtime.watch(platform, reason);
  }

  restart(
    platform: PlatformName | "all",
    reason = "manual",
  ): Promise<GatewaySupervisionRecord[]> {
    return this.runtime.restart(platform, reason);
  }

  receive(
    message: IncomingPlatformMessage,
    options?: GatewayReceiveOptions,
  ): Promise<GatewayReceiveResult> {
    return this.runtime.receive(message, options);
  }

  sendToHomes(
    text: string,
    options?: {
      metadata?: Record<string, string>;
      platforms?: PlatformName[];
      name?: string;
    },
  ): Promise<DeliveredMessageRecord[]> {
    return this.runtime.sendToHomes(text, options);
  }

  editDelivery(
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ): Promise<DeliveredMessageRecord> {
    return this.runtime.editDelivery(deliveryId, text, options);
  }

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
  ): Promise<DeliveredMessageRecord> {
    return this.runtime.sendProgressive(target, parts);
  }

  health(): Promise<Array<PlatformHealth>> {
    return this.runtime.health();
  }

  trace(limit = 20, filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.runtime.trace(limit, filters);
  }

  state(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayStateSnapshot> {
    return this.runtime.state(limit, filters);
  }

  history(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayHistorySnapshot> {
    return this.runtime.history(limit, filters);
  }

  inbox(limit = 20, filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return this.runtime.inbox(limit, filters);
  }

  outbox(limit = 20, filters?: GatewayHistoryFilter): GatewayOutboxRecord[] {
    return this.runtime.outbox(limit, filters);
  }

  attachments(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return this.runtime.attachments(limit, filters);
  }

  supervision(limit = 20): GatewaySupervisionRecord[] {
    return this.runtime.supervision(limit);
  }

  replayInbox(recordId: string): Promise<GatewayInboxReplayResult> {
    return this.runtime.replayInbox(recordId);
  }

  onUpdate(
    listener: (event: {
      kind: GatewayTraceRecord["kind"];
      platform: GatewayTraceRecord["platform"];
      detail: string;
    }) => void,
  ): () => void {
    return this.runtime.onUpdate(listener);
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
