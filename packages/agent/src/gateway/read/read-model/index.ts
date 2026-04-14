import type { GatewayInboxReplayResult } from "@/gateway/receive/replay";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type { PlatformName } from "@/types/gateway";
import type { PlatformHealth } from "../../platforms/base";
import type {
  GatewayHistorySnapshot,
  GatewayStateSnapshot,
  GatewayTransportDetail,
} from "../../state/state-snapshot";
import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../history-view";
import { replayGatewayInboxRecordById } from "./replay";
import { buildGatewayRuntimeStatus } from "./runtime-status";
import {
  readGatewayHealth,
  readGatewayHistory,
  readGatewayState,
} from "./snapshots";
import {
  readGatewayTransportDetail,
  readGatewayTransportOverview,
} from "./transports";
import type {
  GatewayRunnerReadModelDeps,
  GatewayRuntimeStatus,
  GatewayTransportOverview,
} from "./types";

export type {
  GatewayRunnerReadModelDeps,
  GatewayRuntimeStatus,
  GatewayTransportOverview,
} from "./types";

export class GatewayRunnerReadModel {
  constructor(private readonly deps: GatewayRunnerReadModelDeps) {}

  runtimeStatus(): GatewayRuntimeStatus {
    return buildGatewayRuntimeStatus(this.deps);
  }

  async transport(platform: PlatformName): Promise<GatewayTransportDetail> {
    return readGatewayTransportDetail(this.deps, platform);
  }

  async transportOverview(): Promise<GatewayTransportOverview> {
    return readGatewayTransportOverview(
      this.deps.getConfiguredPlatforms(),
      (platform) => this.transport(platform),
    );
  }

  async health(): Promise<PlatformHealth[]> {
    return readGatewayHealth(this.deps.snapshotState);
  }

  trace(limit = 20, filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.deps.historyView.trace(limit, filters);
  }

  async state(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayStateSnapshot> {
    return readGatewayState(this.deps.snapshotState, limit, filters);
  }

  async history(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayHistorySnapshot> {
    return readGatewayHistory(this.deps.snapshotState, limit, filters);
  }

  inbox(limit = 20, filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return this.deps.historyView.inbox(limit, filters);
  }

  outbox(limit = 20, filters?: GatewayHistoryFilter): GatewayOutboxRecord[] {
    return this.deps.historyView.outbox(limit, filters);
  }

  attachments(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return this.deps.historyView.attachments(limit, filters);
  }

  supervision(limit = 20): GatewaySupervisionRecord[] {
    return this.deps.supervisionLog.slice(-limit).reverse();
  }

  async replayInbox(recordId: string): Promise<GatewayInboxReplayResult> {
    return replayGatewayInboxRecordById({
      recordId,
      inboxLog: this.deps.inboxLog,
      receive: this.deps.receive,
      transport: (platform) => this.transport(platform),
    });
  }
}
