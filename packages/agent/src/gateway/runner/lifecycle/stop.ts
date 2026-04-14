import { nowIso } from "../../platforms/base";
import { recordLifecycleTrace } from "./tracing";
import type { GatewayRunnerLifecycleHost } from "./types";

function clearLifecycleIntervals(host: GatewayRunnerLifecycleHost): void {
  if (host.heartbeatInterval) {
    clearInterval(host.heartbeatInterval);
    host.heartbeatInterval = null;
  }

  if (host.supervisionInterval) {
    clearInterval(host.supervisionInterval);
    host.supervisionInterval = null;
  }
}

async function stopAdapters(host: GatewayRunnerLifecycleHost): Promise<void> {
  for (const [platform, adapter] of host.adapters.entries()) {
    await adapter.stop();

    const at = recordLifecycleTrace(
      host,
      platform,
      `Adapter stopped for ${platform}.`,
    );

    await host.observeAdapter(platform, {
      at,
      kind: "stop",
      detail: `Adapter stopped for ${platform}.`,
    });
  }
}

export async function stopGatewayRunnerLifecycle(
  host: GatewayRunnerLifecycleHost,
): Promise<void> {
  clearLifecycleIntervals(host);
  await stopAdapters(host);

  recordLifecycleTrace(
    host,
    "gateway",
    "Gateway stopped and all adapters were shut down.",
    nowIso(),
  );

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
