import { randomUUID } from "node:crypto";

import type { PlatformName } from "@/types/gateway";
import type {
  GatewaySupervisionDependencies,
  GatewaySupervisionRecord,
} from "./types";

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
