import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "@/gateway/read/history-view";
import type { GatewayRuntimeStatus } from "@/gateway/read/read-model";
import type { GatewayInboxReplayResult } from "@/gateway/receive/replay";
import type {
  GatewayHistorySnapshot,
  GatewayStateSnapshot,
  GatewayTransportDetail,
} from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type { PlatformName } from "@/types/gateway";
import type { PlatformHealth } from "../platforms/base";
import type { GatewayRunnerReadModel } from "../read/read-model";

export type GatewayRunnerReadSurfaceModel = Pick<
  GatewayRunnerReadModel,
  | "runtimeStatus"
  | "transport"
  | "transportOverview"
  | "health"
  | "trace"
  | "state"
  | "history"
  | "inbox"
  | "outbox"
  | "attachments"
  | "supervision"
  | "replayInbox"
>;

export interface GatewayRunnerReadSurfaceDeps {
  readModel: GatewayRunnerReadSurfaceModel;
}

export class GatewayRunnerReadSurface {
  constructor(private readonly deps: GatewayRunnerReadSurfaceDeps) {}

  runtimeStatus(): GatewayRuntimeStatus {
    return this.deps.readModel.runtimeStatus();
  }

  async transport(platform: PlatformName): Promise<GatewayTransportDetail> {
    return this.deps.readModel.transport(platform);
  }

  async transportOverview(): Promise<{
    details: GatewayTransportDetail[];
    mismatchCount: number;
    operationalCount: number;
  }> {
    return this.deps.readModel.transportOverview();
  }

  async health(): Promise<Array<PlatformHealth>> {
    return this.deps.readModel.health();
  }

  trace(limit = 20, filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.deps.readModel.trace(limit, filters);
  }

  async state(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayStateSnapshot> {
    return this.deps.readModel.state(limit, filters);
  }

  async history(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayHistorySnapshot> {
    return this.deps.readModel.history(limit, filters);
  }

  inbox(limit = 20, filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return this.deps.readModel.inbox(limit, filters);
  }

  outbox(limit = 20, filters?: GatewayHistoryFilter): GatewayOutboxRecord[] {
    return this.deps.readModel.outbox(limit, filters);
  }

  attachments(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return this.deps.readModel.attachments(limit, filters);
  }

  supervision(limit = 20): GatewaySupervisionRecord[] {
    return this.deps.readModel.supervision(limit);
  }

  async replayInbox(recordId: string): Promise<GatewayInboxReplayResult> {
    return this.deps.readModel.replayInbox(recordId);
  }
}
