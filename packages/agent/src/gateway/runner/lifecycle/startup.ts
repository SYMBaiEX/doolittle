import { loadGatewayConfig } from "@/config/gateway";
import { GATEWAY_DAEMON_POLICY } from "@/gateway/daemon-state";
import type { PlatformName } from "@/types/gateway";

import { nowIso } from "../../platforms/base";
import { recordLifecycleTrace } from "./tracing";
import type { GatewayRunnerLifecycleHost } from "./types";

async function startEnabledAdapters(
  host: GatewayRunnerLifecycleHost,
): Promise<void> {
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

    const at = recordLifecycleTrace(
      host,
      resolvedPlatform,
      `Adapter started for ${resolvedPlatform}.`,
    );

    await host.observeAdapter(resolvedPlatform, {
      at,
      kind: "start",
      detail: `Gateway runner registered live state for ${resolvedPlatform}.`,
    });
  }
}

function ensureLifecycleIntervals(host: GatewayRunnerLifecycleHost): void {
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
}

export async function startGatewayRunnerLifecycle(
  host: GatewayRunnerLifecycleHost,
): Promise<void> {
  if (host.running) {
    return;
  }

  await startEnabledAdapters(host);

  host.running = true;
  host.startedAt = nowIso();
  host.stoppedAt = undefined;
  host.daemonState.lastReason = "startup";
  host.writeRuntimeStatus();

  await host.context.services.hooks.emit("gateway:startup", {
    platforms: Array.from(host.adapters.keys()).join(","),
  });

  ensureLifecycleIntervals(host);

  await host.runHeartbeat("startup");
  await host.runWatchdog("startup");
}
