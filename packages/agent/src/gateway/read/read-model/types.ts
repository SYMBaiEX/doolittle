import type { GatewayDaemonRuntimeState } from "@/gateway/daemon-state";
import type { GatewayReceiveResult } from "@/gateway/receive/index";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type { IncomingPlatformMessage, PlatformName } from "@/types/gateway";
import type {
  GatewayControlPlaneView,
  GatewayHistorySnapshot,
  GatewayNativeMessagingStateView,
  GatewayStateSnapshot,
} from "../../state/state-snapshot";
import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayHistoryView,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../history-view";

export interface GatewayRuntimeStatus {
  pid: number;
  running: boolean;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  lastWatchdogAt?: string;
  lastSupervisionAt?: string;
  supervisionEvents: number;
  adapters: PlatformName[];
  daemon: GatewayDaemonRuntimeState;
  journalPaths: {
    snapshot: string;
    history: string;
    runtime: string;
    supervision: string;
    inbox: string;
    outbox: string;
    attachments: string;
  };
  transportControl: GatewayControlPlaneView["totals"];
  messagingBridge: GatewayControlPlaneView["messagingBridge"];
  transportInventory: GatewayControlPlaneView["transportInventory"];
}

export interface GatewayRunnerReadModelRuntimeMeta {
  pid: number;
  running: boolean;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  lastWatchdogAt?: string;
  lastSupervisionAt?: string;
  adapterPlatforms: PlatformName[];
  journalPaths: GatewayRuntimeStatus["journalPaths"];
}

export interface GatewayRunnerReadModelDeps {
  historyView: GatewayHistoryView;
  traceLog: readonly GatewayTraceRecord[];
  inboxLog: readonly GatewayInboxRecord[];
  outboxLog: readonly GatewayOutboxRecord[];
  attachmentLog: readonly GatewayAttachmentRecord[];
  supervisionLog: readonly GatewaySupervisionRecord[];
  getTransportControlPlane: () => GatewayControlPlaneView;
  buildDaemonRuntimeState: () => GatewayDaemonRuntimeState;
  getRuntimeMeta: () => GatewayRunnerReadModelRuntimeMeta;
  snapshotState: (
    reason: string,
    limit?: number,
    filters?: GatewayHistoryFilter,
  ) => Promise<GatewayHistorySnapshot>;
  getConfiguredPlatforms: () => PlatformName[];
  getNativeMessagingState: (
    platform: PlatformName,
  ) => GatewayNativeMessagingStateView | undefined;
  receive: (message: IncomingPlatformMessage) => Promise<GatewayReceiveResult>;
}

export type GatewayTransportOverview =
  GatewayStateSnapshot["transportOverview"];
