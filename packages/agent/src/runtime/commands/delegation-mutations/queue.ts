import { superviseEffectiveDelegationQueue } from "@/runtime/native/service-bridge/delegation";
import type { AgentExecutionContext } from "../../chat";
import { parseDelegationFilter } from "../delegation-command-parsers";
import { createDelegationQueueCallbacks, runDelegationWorker } from "./shared";
import type { DelegationMutationOptions } from "./types";

export async function handleDelegationQueueMutation(
  trimmed: string,
  context: AgentExecutionContext,
  options: DelegationMutationOptions,
): Promise<string | undefined> {
  if (
    trimmed === "/delegate supervise" ||
    trimmed.startsWith("/delegate supervise ")
  ) {
    const raw = trimmed.replace("/delegate supervise", "").trim();
    const parsed = parseDelegationFilter(raw);
    const callbacks = createDelegationQueueCallbacks(context);
    const report = await superviseEffectiveDelegationQueue(
      context.runtime,
      context.services,
      async (task) => runDelegationWorker(task, options),
      {
        concurrency:
          Number.isFinite(parsed.concurrency) &&
          (parsed.concurrency as number) > 0
            ? (parsed.concurrency as number)
            : 2,
        filter: {
          group: parsed.group,
          profile: parsed.profile,
          priority: parsed.priority,
          label: parsed.label,
          parentTaskId: parsed.parentTaskId,
          status: parsed.status,
          executionMode: parsed.executionMode,
        },
        ...callbacks,
      },
    );
    return JSON.stringify(report, null, 2);
  }

  if (
    trimmed === "/delegate execute-queued" ||
    trimmed.startsWith("/delegate execute-queued ")
  ) {
    const raw = trimmed.replace("/delegate execute-queued", "").trim();
    const concurrency = raw ? Number(raw) : undefined;
    const callbacks = createDelegationQueueCallbacks(context);
    const report = await superviseEffectiveDelegationQueue(
      context.runtime,
      context.services,
      async (task) => runDelegationWorker(task, options),
      {
        concurrency:
          Number.isFinite(concurrency) && (concurrency as number) > 0
            ? (concurrency as number)
            : 2,
        ...callbacks,
      },
    );
    return JSON.stringify(report, null, 2);
  }

  return undefined;
}
