import type { AgentExecutionContext } from "../../../chat";
import {
  describeGatewayRuntimeSnapshot,
  GATEWAY_UNAVAILABLE_MESSAGE,
  renderGatewayOperatorBlock,
} from "./shared";
import type { GatewayRuntimeReadoutHandler } from "./types";

async function handleGatewayRuntimeReadout(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed !== "/gateway runtime") {
    return undefined;
  }
  if (!context.gateway) {
    return GATEWAY_UNAVAILABLE_MESSAGE;
  }

  const state = await context.gateway.state(50);
  const snapshot = describeGatewayRuntimeSnapshot(context);
  return renderGatewayOperatorBlock(
    "Gateway Runtime",
    [
      `Daemon: ${snapshot.daemonRunning ? "running" : "stopped"}`,
      `Runtime: configured=${snapshot.configured} operational=${snapshot.operational} live=${snapshot.live}`,
      `Mediation: pluginMediated=${state.totals.pluginMediatedAdapters} official=${state.totals.officialPluginAdapters} vendored=${state.totals.vendoredPluginAdapters}`,
      `Messaging plugins: ${snapshot.pluginLines.length || 0}`,
      ...snapshot.pluginLines,
    ],
    [
      snapshot.daemonRunning
        ? "Run `/gateway readiness` to inspect transport-by-transport health."
        : "Run `/gateway start` or `POST /gateway/start` before expecting live transport delivery.",
      "Use `/gateway daemon` for daemon-level runtime details.",
    ],
  );
}

async function handleGatewayDaemonReadout(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed !== "/gateway daemon") {
    return undefined;
  }
  if (!context.gateway) {
    return GATEWAY_UNAVAILABLE_MESSAGE;
  }
  const runtime = context.gateway.runtimeStatus();
  const snapshot = describeGatewayRuntimeSnapshot(context);
  return renderGatewayOperatorBlock(
    "Gateway Daemon",
    [
      `Running: ${snapshot.daemonRunning ? "yes" : "no"}`,
      `Configured transports: ${snapshot.configured}`,
      `Operational transports: ${snapshot.operational}`,
      `Live services: ${snapshot.live}`,
      `Daemon detail: ${JSON.stringify(runtime.daemon)}`,
    ],
    [
      snapshot.daemonRunning
        ? "Use `/gateway supervision` if a transport feels stalled."
        : "Start the gateway before testing messaging continuity.",
    ],
  );
}

const RUNTIME_HANDLERS: GatewayRuntimeReadoutHandler[] = [
  handleGatewayRuntimeReadout,
  handleGatewayDaemonReadout,
];

export async function handleRuntimeReadout(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  for (const handler of RUNTIME_HANDLERS) {
    const result = await handler(trimmed, context);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}
