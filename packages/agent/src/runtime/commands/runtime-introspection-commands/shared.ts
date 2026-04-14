import type { AgentExecutionContext } from "@/runtime/chat";
import {
  getNativeOwnershipControlPlane,
  getNativeOwnershipSnapshot,
} from "@/runtime/native/service-bridge/ownership";

export function resolveOwnershipControlPlane(context: AgentExecutionContext) {
  return (
    context.services.nativeOwnership.controlPlane() ??
    getNativeOwnershipControlPlane(
      context.runtime,
      context.services,
      context.config,
      context.services.gatewayConfig,
    )
  );
}

export async function resolveOwnershipSnapshot(context: AgentExecutionContext) {
  return (
    (await context.services.nativeOwnership.snapshot()) ??
    (await getNativeOwnershipSnapshot(
      context.runtime,
      context.services,
      context.config,
      context.services.gatewayConfig,
    ))
  );
}

export function renderRuntimeOperatorBlock(
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
