import type { PlatformName } from "@/types/gateway";
import { GATEWAY_DAEMON_POLICY } from "../daemon-state";
import type { PlatformAdapter } from "../platforms/base";
import { applySupervisionOutcome } from "./outcome";
import type {
  GatewaySupervisionDependencies,
  GatewaySupervisionRecord,
} from "./types";

export async function runGatewayWatchdogPlatform(params: {
  deps: GatewaySupervisionDependencies;
  platform: PlatformName;
  adapter: PlatformAdapter;
  reason: string;
  watchdogAt: string;
}): Promise<GatewaySupervisionRecord[]> {
  const { deps, platform, adapter, reason, watchdogAt } = params;
  const health = await adapter.health();
  const restartState = deps.ensureRestartState(platform);
  const backoffActive =
    restartState.nextEligibleAt !== undefined &&
    new Date(restartState.nextEligibleAt).getTime() > Date.now();

  if (health.ready) {
    const records = [
      applySupervisionOutcome(
        deps,
        platform,
        "healthy",
        `${platform} healthy during ${reason}.`,
      ),
    ];

    if (platform === "homeassistant") {
      const watchResult = await adapter.watch?.(reason);
      if (watchResult) {
        records.push(
          deps.recordSupervision(
            platform,
            "watch",
            `Home Assistant watch cycle observed ${watchResult.count} states during ${reason}.`,
          ),
        );
        await deps.observeAdapter(platform, {
          at: watchResult.watchedAt,
          kind: "heartbeat",
          detail: watchResult.summary,
        });
      }
      records.push(
        deps.recordSupervision(
          platform,
          "watch",
          `Home Assistant watcher cycle acknowledged during ${reason}.`,
        ),
      );
    }

    return records;
  }

  const restartable = health.status === "running" || health.status === "idle";
  if (!restartable) {
    return [
      applySupervisionOutcome(
        deps,
        platform,
        "skip",
        `${platform} supervision skipped during ${reason}; adapter status ${health.status}.`,
      ),
    ];
  }

  if (backoffActive) {
    return [
      applySupervisionOutcome(
        deps,
        platform,
        "backoff",
        `${platform} restart delayed until ${restartState.nextEligibleAt} during ${reason}.`,
        restartState.backoffMs,
      ),
    ];
  }

  try {
    await adapter.stop();
    await adapter.start();
    restartState.failures = 0;
    restartState.nextEligibleAt = undefined;
    restartState.backoffMs = GATEWAY_DAEMON_POLICY.restartBaseDelayMs;
    restartState.lastRestartAt = watchdogAt;
    restartState.lastAction = "restart";
    return [
      applySupervisionOutcome(
        deps,
        platform,
        "restart",
        `${platform} adapter restart attempted during ${reason}.`,
      ),
    ];
  } catch (error) {
    const detail = `${platform} recovery failed during ${reason}: ${error instanceof Error ? error.message : String(error)}`;
    return [applySupervisionOutcome(deps, platform, "recover", detail)];
  }
}
