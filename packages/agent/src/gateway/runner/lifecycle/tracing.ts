import { randomUUID } from "node:crypto";

import { nowIso } from "../../platforms/base";
import type {
  GatewayRunnerLifecycleHost,
  GatewayRunnerLifecycleTraceEntry,
} from "./types";

type GatewayRunnerLifecycleTracePlatform =
  GatewayRunnerLifecycleTraceEntry["platform"];

function pushTrace(
  host: GatewayRunnerLifecycleHost,
  kind: GatewayRunnerLifecycleTraceEntry["kind"],
  platform: GatewayRunnerLifecycleTracePlatform,
  detail: string,
  at = nowIso(),
): string {
  host.pushTrace({
    traceId: randomUUID(),
    at,
    kind,
    platform,
    detail,
  });
  return at;
}

export function recordLifecycleTrace(
  host: GatewayRunnerLifecycleHost,
  platform: GatewayRunnerLifecycleTracePlatform,
  detail: string,
  at?: string,
): string {
  return pushTrace(host, "lifecycle", platform, detail, at);
}

export function recordHeartbeatTrace(
  host: GatewayRunnerLifecycleHost,
  platform: GatewayRunnerLifecycleTracePlatform,
  detail: string,
  at?: string,
): string {
  return pushTrace(host, "heartbeat", platform, detail, at);
}
