import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog";
import { getNativeTransportControlPlane } from "@/runtime/native/service-bridge/transport-control";
import type { AppContext } from "../../../bootstrap";
import type { AgentExecutionContext } from "../../../chat";

export const GATEWAY_UNAVAILABLE_MESSAGE =
  "Gateway runtime is not attached to this execution context.";

export function getMessagingPluginLines(
  context: AgentExecutionContext,
): string[] {
  const grouped = groupNativePluginCatalog(getNativePluginCatalog(context.config));
  return (grouped.messaging ?? []).map(
    (entry) =>
      `- plugin ${entry.id} [${entry.enabled ? "enabled" : "disabled"}] source=${entry.source} :: ${entry.notes}`,
  );
}

export function getTransportControlPlane(context: AgentExecutionContext) {
  return getNativeTransportControlPlane(
    context.runtime,
    context.config,
    context.services.gatewayConfig,
  );
}

export function renderGatewayOperatorBlock(
  title: string,
  lines: string[],
  nextSteps: string[] = [],
): string {
  return [
    title,
    ...lines,
    ...(nextSteps.length
      ? [
          "",
          "Next:",
          ...nextSteps.map((step, index) => `${index + 1}. ${step}`),
        ]
      : []),
  ].join("\n");
}

export function describeGatewayRuntimeSnapshot(
  context: AgentExecutionContext,
): {
  daemonRunning: boolean;
  configured: number;
  operational: number;
  live: number;
  pluginLines: string[];
} {
  const runtime = context.gateway?.runtimeStatus();
  const controlPlane = getTransportControlPlane(context);
  const pluginLines = getMessagingPluginLines(context);
  return {
    daemonRunning: Boolean(runtime?.daemon?.watchdog?.running),
    configured:
      runtime?.transportControl?.configured ??
      controlPlane.transportInventory.length,
    operational:
      runtime?.transportControl?.operationalTransports ??
      controlPlane.transportInventory.filter((entry) => entry.operational)
        .length,
    live:
      runtime?.transportControl?.liveServices ??
      controlPlane.messagingBridge.filter((entry) => entry.live).length,
    pluginLines,
  };
}

export function asAppContext(context: AgentExecutionContext): AppContext {
  return context as AppContext;
}
