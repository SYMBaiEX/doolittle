import { randomUUID } from "node:crypto";

import type { PlatformName } from "@/types/gateway";
import {
  computeGatewayRestartBackoffMs,
  GATEWAY_DAEMON_POLICY,
  type GatewayDaemonState,
  type GatewayRestartState,
} from "../daemon-state";
import type { PlatformAdapter, PlatformHealth } from "../platforms/base";
import type { GatewayTraceRecord } from "../read/history-view";
import {
  applySupervisionOutcome,
  runGatewayWatchdogPlatform,
} from "./watchdog-cycle";

export type GatewayTransportState =
  | "inactive"
  | "booting"
  | "live"
  | "degraded"
  | "paused";

export type GatewaySupervisionAction =
  | "health"
  | "restart"
  | "recover"
  | "watch"
  | "skip"
  | "backoff";

export interface GatewaySupervisionRecord {
  at: string;
  platform: PlatformName | "gateway";
  action: GatewaySupervisionAction;
  detail: string;
  delayMs?: number;
  attempt?: number;
}

export interface GatewaySupervisionPlatformState {
  ready: boolean;
  status: PlatformHealth["status"];
  transportState: GatewayTransportState;
  restartCount: number;
  restartFailureCount: number;
  lastRestartAt?: string;
  nextRestartAt?: string;
  lastWatchdogAt?: string;
  lastWatchdogReason?: string;
  lastWatchdogAction?: "healthy" | "restart" | "recover" | "backoff" | "skip";
}

export interface GatewaySupervisionDependencies {
  adapters: Map<PlatformName, PlatformAdapter>;
  daemonState: GatewayDaemonState;
  ensureRestartState(platform: PlatformName): GatewayRestartState;
  getPlatformState(platform: PlatformName): GatewaySupervisionPlatformState;
  setLastSupervisionAt(at: string): void;
  recordSupervision(
    platform: PlatformName | "gateway",
    action: GatewaySupervisionAction,
    detail: string,
    delayMs?: number,
    attempt?: number,
  ): GatewaySupervisionRecord;
  observeAdapter(
    platform: PlatformName,
    event: {
      at: string;
      kind:
        | "start"
        | "stop"
        | "heartbeat"
        | "receive"
        | "authorize"
        | "route"
        | "respond"
        | "deliver"
        | "reject"
        | "edit";
      detail: string;
    },
  ): Promise<void>;
  pushTrace?(entry: GatewayTraceRecord): void;
  writeRuntimeStatus(): void;
  snapshotState(reason: string, limit?: number): Promise<unknown>;
  nowIso(): string;
}

export async function runGatewayWatchdog(
  deps: GatewaySupervisionDependencies,
  reason = "watchdog",
): Promise<GatewaySupervisionRecord[]> {
  const records: GatewaySupervisionRecord[] = [];
  const watchdogAt = deps.nowIso();
  deps.setLastSupervisionAt(watchdogAt);
  deps.daemonState.watchdogRuns += 1;
  deps.daemonState.lastWatchdogAt = watchdogAt;
  deps.daemonState.lastReason = reason;

  for (const [platform, adapter] of deps.adapters.entries()) {
    records.push(
      ...(await runGatewayWatchdogPlatform({
        deps,
        platform,
        adapter,
        reason,
        watchdogAt,
      })),
    );
  }

  deps.writeRuntimeStatus();
  await deps.snapshotState(`watchdog:${reason}`, 20);
  return records;
}

export async function runGatewayWatch(
  deps: GatewaySupervisionDependencies,
  platform: PlatformName | "all",
  reason = "manual-watch",
): Promise<GatewaySupervisionRecord[]> {
  if (platform === "all") {
    const records: GatewaySupervisionRecord[] = [];
    for (const candidate of deps.adapters.keys()) {
      records.push(...(await runGatewayWatch(deps, candidate, reason)));
    }
    return records;
  }

  const adapter = deps.adapters.get(platform);
  if (!adapter) {
    return [
      deps.recordSupervision(
        platform,
        "skip",
        `${platform} watch skipped during ${reason}; adapter is not active.`,
      ),
    ];
  }

  if (typeof adapter.watch !== "function") {
    return [
      deps.recordSupervision(
        platform,
        "skip",
        `${platform} watch skipped during ${reason}; adapter does not support watch cycles.`,
      ),
    ];
  }

  const result = await adapter.watch(reason);
  await deps.observeAdapter(platform, {
    at: result.watchedAt,
    kind: "heartbeat",
    detail: `${platform} watch cycle observed ${result.count} states during ${reason}.`,
  });
  deps.pushTrace?.({
    traceId: randomUUID(),
    at: result.watchedAt,
    kind: "heartbeat",
    platform,
    detail: result.summary,
  });
  deps.writeRuntimeStatus();
  await deps.snapshotState(`watch:${platform}:${reason}`, 20);
  return [
    deps.recordSupervision(
      platform,
      "watch",
      `${platform} watch cycle observed ${result.count} states during ${reason}.`,
    ),
  ];
}

export async function runGatewayRestart(
  deps: GatewaySupervisionDependencies,
  platform: PlatformName | "all",
  reason = "manual",
): Promise<GatewaySupervisionRecord[]> {
  if (platform === "all") {
    const records: GatewaySupervisionRecord[] = [];
    for (const candidate of deps.adapters.keys()) {
      records.push(...(await runGatewayRestart(deps, candidate, reason)));
    }
    return records;
  }

  const adapter = deps.adapters.get(platform);
  if (!adapter) {
    return [
      deps.recordSupervision(
        platform,
        "skip",
        `${platform} restart skipped during ${reason}; adapter is not active.`,
      ),
    ];
  }

  const restartState = deps.ensureRestartState(platform);
  try {
    await adapter.stop();
    await adapter.start();
    restartState.failures = 0;
    restartState.nextEligibleAt = undefined;
    restartState.backoffMs = GATEWAY_DAEMON_POLICY.restartBaseDelayMs;
    restartState.lastRestartAt = deps.nowIso();
    restartState.lastAction = "restart";
    deps.writeRuntimeStatus();
    await deps.snapshotState(`restart:${platform}:${reason}`, 20);
    return [
      deps.recordSupervision(
        platform,
        "restart",
        `${platform} adapter restarted during ${reason}.`,
      ),
    ];
  } catch (error) {
    const detail = `${platform} restart failed during ${reason}: ${error instanceof Error ? error.message : String(error)}`;
    const delayMs = computeGatewayRestartBackoffMs(
      GATEWAY_DAEMON_POLICY,
      restartState.failures + 1,
    );
    deps.writeRuntimeStatus();
    await deps.snapshotState(`restart-failed:${platform}:${reason}`, 20);
    return [
      applySupervisionOutcome(deps, platform, "recover", detail, delayMs),
    ];
  }
}
