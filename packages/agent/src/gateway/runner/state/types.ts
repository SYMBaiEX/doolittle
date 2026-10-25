import type {
  DeliveredMessageRecord,
  PlatformName,
  SessionRoute,
} from "../../../types/gateway";
import type {
  GatewayDaemonState,
  GatewayRestartState,
} from "../../daemon-state";
import type { PlatformAdapter } from "../../platforms/base/index";
import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../../read/history-view/index";
import type { GatewayNativePluginInfo } from "../../state/platform-state";
import type {
  GatewayControlPlaneView,
  GatewayHistorySnapshot,
  GatewayPlatformStateView,
} from "../../state/state-snapshot/index";

export interface GatewayRunnerHistoryWindow {
  allTraces: GatewayTraceRecord[];
  traces: GatewayTraceRecord[];
  inbox: GatewayInboxRecord[];
  outbox: GatewayOutboxRecord[];
  attachments: GatewayAttachmentRecord[];
  deliveries: DeliveredMessageRecord[];
  sessions: SessionRoute[];
}

export interface GatewayRunnerStateBookkeepingDeps {
  adapters: ReadonlyMap<PlatformName, PlatformAdapter>;
  platformStates: Map<PlatformName, GatewayPlatformStateView>;
  restartBackoffByPlatform: Map<PlatformName, GatewayRestartState>;
  daemonState: GatewayDaemonState;
  resolveNativeMessagingPlugin: (
    platform: PlatformName,
  ) => GatewayNativePluginInfo | undefined;
  getConfiguredPlatforms: () => PlatformName[];
  isPlatformEnabled: (platform: PlatformName) => boolean;
  getTransportControlPlane: () => GatewayControlPlaneView;
  isRunning: () => boolean;
  getSnapshotPaths: () => {
    snapshotPath: string;
    historyPath: string;
  };
  getWatchdogAt: () => string | undefined;
  loadHistoryWindow: (
    limit: number,
    filters?: GatewayHistoryFilter,
  ) => GatewayRunnerHistoryWindow;
  persistSnapshot: (
    reason: string,
    snapshot: GatewayHistorySnapshot,
  ) => Promise<void>;
}
