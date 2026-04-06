import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import type { GatewayRuntimeStatus } from "@/gateway/read/read-model";
import { appendGatewayJournalRecord } from "@/gateway/recording/journal";
import {
  recordGatewayInboxJournalEntry,
  recordGatewayOutboxJournalEntry,
} from "@/gateway/recording/message-journal";
import type { GatewayPlatformStateView } from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  PlatformName,
} from "@/types/gateway";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../read/history-view";

export interface GatewayRunnerUpdateEvent {
  kind: GatewayTraceRecord["kind"];
  platform: GatewayTraceRecord["platform"];
  detail: string;
}

export interface GatewayRunnerRecordingDeps {
  traceLog: GatewayTraceRecord[];
  inboxLog: GatewayInboxRecord[];
  outboxLog: GatewayOutboxRecord[];
  attachmentLog: GatewayAttachmentRecord[];
  supervisionLog: GatewaySupervisionRecord[];
  inboxPath: string;
  outboxPath: string;
  attachmentsPath: string;
  supervisionPath: string;
  runtimeStatusPath: string;
  ensurePlatformState: (platform: PlatformName) => GatewayPlatformStateView;
  updatePlatformStateFromTrace: (entry: GatewayTraceRecord) => void;
  getRuntimeStatus: () => GatewayRuntimeStatus;
  maxLogEntries?: number;
}

export class GatewayRunnerRecording {
  private readonly events = new EventEmitter();

  constructor(private readonly deps: GatewayRunnerRecordingDeps) {}

  recordInbox(
    message: IncomingPlatformMessage,
    traceId: string,
    sessionId?: string,
    status: GatewayInboxRecord["status"] = "received",
    notes: string[] = [],
  ): GatewayInboxRecord {
    const { record, attachments } = recordGatewayInboxJournalEntry({
      traceId,
      sessionId,
      message,
      status,
      notes,
      recordLog: this.deps.inboxLog,
      recordPath: this.deps.inboxPath,
      attachmentLog: this.deps.attachmentLog,
      attachmentsPath: this.deps.attachmentsPath,
    });
    const state = this.deps.ensurePlatformState(message.platform);
    state.inboxCount += 1;
    state.lastInboundAt = record.at;
    state.lastReceivedAt = record.at;
    state.transportState =
      status === "accepted"
        ? state.ready
          ? "live"
          : "degraded"
        : status === "rejected"
          ? "paused"
          : state.transportState;
    if (attachments.length > 0) {
      state.attachmentCount += attachments.length;
      state.lastAttachmentAt = record.at;
      state.lastAttachmentKind = attachments.at(-1)?.kind;
    }
    return record;
  }

  recordOutbox(
    platform: PlatformName,
    traceId: string,
    sessionId: string | undefined,
    delivery: DeliveredMessageRecord,
    message: OutboundPlatformMessage,
    status: GatewayOutboxRecord["status"],
  ): GatewayOutboxRecord {
    const { record, attachments } = recordGatewayOutboxJournalEntry({
      platform,
      traceId,
      sessionId,
      delivery,
      message,
      status,
      recordLog: this.deps.outboxLog,
      recordPath: this.deps.outboxPath,
      attachmentLog: this.deps.attachmentLog,
      attachmentsPath: this.deps.attachmentsPath,
    });
    const state = this.deps.ensurePlatformState(platform);
    state.outboxCount += 1;
    state.lastOutboundRoomId = message.roomId;
    state.lastOutboundUserId = message.userId;
    state.lastOutboundThreadId = message.threadId;
    state.lastOutboundReplyToId = message.replyToId;
    state.lastOutboundMetadataKeys = Object.keys(message.metadata ?? {});
    if (attachments.length > 0) {
      state.attachmentCount += attachments.length;
      state.lastAttachmentAt = record.at;
      state.lastAttachmentKind = attachments.at(-1)?.kind;
    }
    state.lastOutboundAt = record.at;
    state.lastDeliveryAt = record.at;
    state.lastDeliveryId = delivery.id;
    state.transportState = state.ready ? "live" : "degraded";
    return record;
  }

  pushTrace(entry: GatewayTraceRecord): void {
    this.deps.traceLog.push(entry);
    this.deps.updatePlatformStateFromTrace(entry);
    this.trimLog(this.deps.traceLog);
    this.emitUpdate({
      kind: entry.kind,
      platform: entry.platform,
      detail: entry.detail,
    });
  }

  recordSupervision(
    platform: PlatformName | "gateway",
    action: GatewaySupervisionRecord["action"],
    detail: string,
    delayMs?: number,
    attempt?: number,
  ): GatewaySupervisionRecord {
    const record: GatewaySupervisionRecord = {
      at: new Date().toISOString(),
      platform,
      action,
      detail,
      delayMs,
      attempt,
    };
    this.deps.supervisionLog.push(record);
    this.trimLog(this.deps.supervisionLog);
    appendGatewayJournalRecord(this.deps.supervisionPath, record);
    this.emitUpdate({
      kind: "lifecycle",
      platform,
      detail,
    });
    return record;
  }

  onUpdate(listener: (event: GatewayRunnerUpdateEvent) => void): () => void {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  writeRuntimeStatus(): void {
    writeFileSync(
      this.deps.runtimeStatusPath,
      JSON.stringify(this.deps.getRuntimeStatus(), null, 2),
      "utf8",
    );
  }

  private emitUpdate(event: GatewayRunnerUpdateEvent): void {
    this.events.emit("update", event);
  }

  private trimLog<T>(log: T[]): void {
    const maxLogEntries = this.deps.maxLogEntries ?? 200;
    if (log.length > maxLogEntries) {
      log.splice(0, log.length - maxLogEntries);
    }
  }
}
