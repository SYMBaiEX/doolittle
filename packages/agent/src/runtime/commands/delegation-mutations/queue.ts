import { superviseEffectiveDelegationQueue } from "@/runtime/native/service-bridge/delegation";
import type { AgentExecutionContext } from "../../chat";
import type { DelegationMutationOptions } from "./types";

export async function handleDelegationQueueMutation(
  trimmed: string,
  context: AgentExecutionContext,
  _options: DelegationMutationOptions,
): Promise<string | undefined> {
  if (
    trimmed === "/delegate supervise" ||
    trimmed.startsWith("/delegate supervise ")
  ) {
    const report = await superviseEffectiveDelegationQueue(context.runtime);
    return JSON.stringify(report, null, 2);
  }

  if (
    trimmed === "/delegate execute-queued" ||
    trimmed.startsWith("/delegate execute-queued ")
  ) {
    const report = await superviseEffectiveDelegationQueue(context.runtime);
    return JSON.stringify(report, null, 2);
  }

  return undefined;
}
