import type { PlatformName } from "@/types/gateway";
import type { PlatformHealth } from "../../platforms/base";
import type {
  GatewayControlPlaneView,
  GatewayNativeMessagingStateView,
  GatewayPlatformStateView,
  GatewayTransportDetail,
} from "../../state/state-snapshot";
import { summarizeTransportJournalEntry } from "../../trace-summary";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../history-view";
import { createGatewayPlatformStateView } from "../platform-state-view";
import { getTransportLastActivityAt } from "./activity";
import { getTransportCounts } from "./counts";
import { collectTransportMismatchFlags } from "./mismatch-flags";
import { getPlatformRecords } from "./recent-records";

export interface BuildGatewayTransportDetailOptions {
  platform: PlatformName;
  controlPlane: GatewayControlPlaneView;
  platformState?: GatewayPlatformStateView;
  readiness?: PlatformHealth;
  traces: readonly GatewayTraceRecord[];
  inbox: readonly GatewayInboxRecord[];
  outbox: readonly GatewayOutboxRecord[];
  attachments: readonly GatewayAttachmentRecord[];
  nativeMessagingState?: GatewayNativeMessagingStateView;
  recentLimit?: number;
  includeHealthMismatch?: boolean;
  countFromRecent?: boolean;
}

export function buildGatewayTransportDetail(
  options: BuildGatewayTransportDetailOptions,
): GatewayTransportDetail {
  const platformState =
    options.platformState ?? createGatewayPlatformStateView(options.platform);
  const inventory = options.controlPlane.transportInventory.find(
    (entry) => entry.platform === options.platform,
  );
  const messagingBridge = options.controlPlane.messagingBridge.find(
    (entry) => entry.platform === options.platform,
  );
  const recentLimit = options.recentLimit ?? 20;

  const platformTraces = getPlatformRecords(
    options.traces,
    options.platform,
    recentLimit,
  );
  const platformInbox = getPlatformRecords(
    options.inbox,
    options.platform,
    recentLimit,
  );
  const platformOutbox = getPlatformRecords(
    options.outbox,
    options.platform,
    recentLimit,
  );
  const platformAttachments = getPlatformRecords(
    options.attachments,
    options.platform,
    recentLimit,
  );

  const mismatchFlags = collectTransportMismatchFlags({
    platform: options.platform,
    controlPlane: options.controlPlane,
    platformState,
    readiness: options.readiness,
    includeHealthMismatch: options.includeHealthMismatch,
  });

  const source =
    inventory?.source ?? platformState.nativePluginSource ?? "custom";

  const { traceCount, inboxCount, outboxCount, attachmentCount } =
    getTransportCounts({
      traces: platformTraces.all,
      inbox: platformInbox.all,
      outbox: platformOutbox.all,
      attachments: platformAttachments.all,
      countFromRecent: options.countFromRecent,
      recentTraces: platformTraces.recent,
      recentInbox: platformInbox.recent,
      recentOutbox: platformOutbox.recent,
      recentAttachments: platformAttachments.recent,
    });

  const lastActivityAt = getTransportLastActivityAt({
    platformState,
    readiness: options.readiness,
    includeHealthMismatch: options.includeHealthMismatch,
  });

  return {
    platform: options.platform,
    inventory,
    messagingBridge,
    nativeMessagingState: options.nativeMessagingState,
    platformState,
    readiness: options.readiness,
    traceCount,
    inboxCount,
    outboxCount,
    attachmentCount,
    recentTraces: platformTraces.recent,
    recentInbox: platformInbox.recent,
    recentOutbox: platformOutbox.recent,
    recentAttachments: platformAttachments.recent,
    mismatchFlags,
    lastActivityAt,
    summary: buildTransportJournalSummary({
      platform: options.platform,
      source,
      operational: inventory?.operational ?? false,
      ready:
        options.nativeMessagingState?.ready ??
        options.readiness?.ready ??
        false,
      transportState: platformState.transportState,
      status: options.readiness?.status,
      restartCount: platformState.restartCount,
      restartFailures: platformState.restartFailureCount,
      backoffUntilAt: platformState.nextRestartAt,
      traceCount,
      inboxCount,
      outboxCount,
      attachmentCount,
      mismatchFlags,
      lastTraceKind: platformState.lastTraceKind,
      lastEventKind: platformState.lastEventKind,
      nativeMessagingSummary: options.nativeMessagingState?.summary,
      lastActivityAt,
    }),
  };
}

interface TransportJournalSummaryContext {
  platform: PlatformName;
  source: string;
  operational: boolean;
  ready: boolean;
  transportState?: GatewayPlatformStateView["transportState"];
  status?: import("@/gateway/platforms/base").PlatformHealth["status"];
  restartCount?: number;
  restartFailures?: number;
  backoffUntilAt?: string;
  traceCount: number;
  inboxCount: number;
  outboxCount: number;
  attachmentCount: number;
  mismatchFlags: string[];
  lastTraceKind?: GatewayPlatformStateView["lastTraceKind"];
  lastEventKind?: GatewayPlatformStateView["lastEventKind"];
  nativeMessagingSummary?: string;
  lastActivityAt?: string;
}

function buildTransportJournalSummary(
  context: TransportJournalSummaryContext,
): string {
  return summarizeTransportJournalEntry(
    {
      platform: context.platform,
      source: context.source,
      operational: context.operational,
      ready: context.ready,
      transportState: context.transportState,
      status: context.status,
      restartCount: context.restartCount ?? 0,
      restartFailures: context.restartFailures ?? 0,
      backoffUntilAt: context.backoffUntilAt,
      traceCount: context.traceCount,
      inboxCount: context.inboxCount,
      outboxCount: context.outboxCount,
      attachmentCount: context.attachmentCount,
      mismatchFlags: context.mismatchFlags,
      lastTraceKind: context.lastTraceKind,
      lastEventKind: context.lastEventKind,
      nativeMessagingSummary: context.nativeMessagingSummary,
    },
    context.lastActivityAt,
  );
}
