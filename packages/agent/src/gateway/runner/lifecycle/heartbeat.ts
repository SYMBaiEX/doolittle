import { nowIso } from "../../platforms/base";
import { recordHeartbeatTrace } from "./tracing";
import type { GatewayRunnerLifecycleHost } from "./types";

async function publishPlatformHeartbeats(
  host: GatewayRunnerLifecycleHost,
  heartbeatAt: string,
): Promise<void> {
  for (const platform of host.adapters.keys()) {
    const detail = `${platform} transport heartbeat at ${heartbeatAt}.`;

    recordHeartbeatTrace(host, platform, detail, heartbeatAt);
    await host.observeAdapter(platform, {
      at: heartbeatAt,
      kind: "heartbeat",
      detail,
    });
  }
}

export async function heartbeatGatewayRunner(
  host: GatewayRunnerLifecycleHost,
  reason = "heartbeat",
) {
  const heartbeatAt = nowIso();

  host.lastHeartbeatAt = heartbeatAt;
  host.daemonState.heartbeatRuns += 1;
  host.daemonState.lastHeartbeatAt = heartbeatAt;
  host.daemonState.lastReason = reason;

  await publishPlatformHeartbeats(host, heartbeatAt);

  recordHeartbeatTrace(
    host,
    "gateway",
    `Gateway heartbeat recorded for ${host.adapters.size} adapters.`,
    heartbeatAt,
  );

  await host.context.services.hooks.emit("gateway:heartbeat", {
    status: host.running ? "running" : "stopped",
    adapters: String(host.adapters.size),
  });
  host.writeRuntimeStatus();

  const snapshot = await host.snapshotState(reason, 20);
  return snapshot.state;
}
