import type { RuntimeLike } from "@/runtime/native/service-bridge/runtime";

export interface OperatorRuntimeAttachment {
  runtime?: RuntimeLike;
}

export function createOperatorRuntimeAttachment(): OperatorRuntimeAttachment {
  return {};
}

export function attachOperatorRuntime(
  attachment: OperatorRuntimeAttachment,
  runtime: RuntimeLike,
): void {
  attachment.runtime = runtime;
}

export function getAttachedOperatorRuntime(
  attachment: OperatorRuntimeAttachment,
): RuntimeLike | undefined {
  return attachment.runtime;
}
