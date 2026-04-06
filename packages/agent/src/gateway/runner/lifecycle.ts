import { randomUUID } from "node:crypto";

import { loadGatewayConfig } from "@/config/gateway";
import {
  GATEWAY_DAEMON_POLICY,
  type GatewayDaemonState,
} from "@/gateway/daemon-state";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type {
  GatewayHistorySnapshot,
  GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type { PlatformName } from "@/types/gateway";

import {
  nowIso,
  type PlatformAdapter,
  type PlatformHealth,
  type PlatformLifecycleEvent,
} from "../platforms/base";

export interface GatewayRunnerLifecycleHost {
  context: GatewayRunnerContext;
  adapters: Map<PlatformName, PlatformAdapter>;
  daemonState: GatewayDaemonState;
  running: boolean;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  supervisionInterval: ReturnType<typeof setInterval> | null;
  createAdapter(platform: PlatformName): PlatformAdapter;
  ensureRestartState(platform: PlatformName): void;
  syncPlatformStateFromHealth(health: PlatformHealth): void;
  pushTrace(entry: {
    traceId: string;
    at: string;
    kind: "lifecycle" | "heartbeat";
    platform: PlatformName | "gateway";
    detail: string;
  }): void;
  observeAdapter(
    platform: PlatformName,
    event: PlatformLifecycleEvent,
  ): Promise<void>;
  writeRuntimeStatus(): void;
  snapshotState(reason: string, limit: number): Promise<GatewayHistorySnapshot>;
  runHeartbeat(reason: string): Promise<GatewayStateSnapshot>;
  runWatchdog(reason: string): Promise<GatewaySupervisionRecord[]>;
}

export async function startGatewayRunnerLifecycle(
  host: GatewayRunnerLifecycleHost,
): Promise<void> {
  if (host.running) {
    return;
  }

  const gatewayConfig = loadGatewayConfig(host.context.config);
  for (const [platform, platformConfig] of Object.entries(
    gatewayConfig.platforms,
  )) {
    if (!platformConfig.enabled) {
      continue;
    }

    const resolvedPlatform = platform as PlatformName;
    const adapter = host.createAdapter(resolvedPlatform);
    await adapter.start();
    host.adapters.set(resolvedPlatform, adapter);
    host.ensureRestartState(resolvedPlatform);
    const health = await adapter.health();
    host.syncPlatformStateFromHealth(health);
    const at = nowIso();
    host.pushTrace({
      traceId: randomUUID(),
      at,
      kind: "lifecycle",
      platform: resolvedPlatform,
      detail: `Adapter started for ${resolvedPlatform}.`,
    });
    await host.observeAdapter(resolvedPlatform, {
      at,
      kind: "start",
      detail: `Gateway runner registered live state for ${resolvedPlatform}.`,
    });
  }

  host.running = true;
  host.startedAt = nowIso();
  host.stoppedAt = undefined;
  host.daemonState.lastReason = "startup";
  host.writeRuntimeStatus();
  await host.context.services.hooks.emit("gateway:startup", {
    platforms: Array.from(host.adapters.keys()).join(","),
  });

  if (!host.heartbeatInterval) {
    host.heartbeatInterval = setInterval(() => {
      void host.runHeartbeat("interval");
    }, GATEWAY_DAEMON_POLICY.heartbeatIntervalMs);
    host.heartbeatInterval.unref?.();
  }
  if (!host.supervisionInterval) {
    host.supervisionInterval = setInterval(() => {
      void host.runWatchdog("interval");
    }, GATEWAY_DAEMON_POLICY.watchdogIntervalMs);
    host.supervisionInterval.unref?.();
  }

  await host.runHeartbeat("startup");
  await host.runWatchdog("startup");
}

export async function stopGatewayRunnerLifecycle(
  host: GatewayRunnerLifecycleHost,
): Promise<void> {
  if (host.heartbeatInterval) {
    clearInterval(host.heartbeatInterval);
    host.heartbeatInterval = null;
  }
  if (host.supervisionInterval) {
    clearInterval(host.supervisionInterval);
    host.supervisionInterval = null;
  }

  for (const [platform, adapter] of host.adapters.entries()) {
    await adapter.stop();
    const at = nowIso();
    host.pushTrace({
      traceId: randomUUID(),
      at,
      kind: "lifecycle",
      platform,
      detail: `Adapter stopped for ${platform}.`,
    });
    await host.observeAdapter(platform, {
      at,
      kind: "stop",
      detail: `Adapter stopped for ${platform}.`,
    });
  }

  host.pushTrace({
    traceId: randomUUID(),
    at: nowIso(),
    kind: "lifecycle",
    platform: "gateway",
    detail: "Gateway stopped and all adapters were shut down.",
  });
  host.running = false;
  host.stoppedAt = nowIso();
  host.daemonState.lastReason = "shutdown";
  host.writeRuntimeStatus();
  await host.context.services.hooks.emit("gateway:shutdown", {
    status: "stopped",
  });
  await host.snapshotState("stop", 20);
  host.adapters.clear();
}

export async function heartbeatGatewayRunner(
  host: GatewayRunnerLifecycleHost,
  reason = "heartbeat",
): Promise<GatewayStateSnapshot> {
  const heartbeatAt = nowIso();
  host.lastHeartbeatAt = heartbeatAt;
  host.daemonState.heartbeatRuns += 1;
  host.daemonState.lastHeartbeatAt = heartbeatAt;
  host.daemonState.lastReason = reason;
  for (const platform of host.adapters.keys()) {
    const detail = `${platform} transport heartbeat at ${heartbeatAt}.`;
    host.pushTrace({
      traceId: randomUUID(),
      at: heartbeatAt,
      kind: "heartbeat",
      platform,
      detail,
    });
    await host.observeAdapter(platform, {
      at: heartbeatAt,
      kind: "heartbeat",
      detail,
    });
  }

  host.pushTrace({
    traceId: randomUUID(),
    at: heartbeatAt,
    kind: "heartbeat",
    platform: "gateway",
    detail: `Gateway heartbeat recorded for ${host.adapters.size} adapters.`,
  });
  await host.context.services.hooks.emit("gateway:heartbeat", {
    status: host.running ? "running" : "stopped",
    adapters: String(host.adapters.size),
  });
  host.writeRuntimeStatus();
  const snapshot = await host.snapshotState(reason, 20);
  return snapshot.state;
}
