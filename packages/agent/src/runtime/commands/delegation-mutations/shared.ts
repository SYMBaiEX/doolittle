import type { AgentExecutionContext } from "../../chat";
import type { DelegationMutationOptions } from "./types";

export async function runDelegationWorker(
  task: unknown,
  options: DelegationMutationOptions,
): Promise<string> {
  const completedTask = await options.runDelegationTaskInWorker(
    (task as { id: string }).id,
    {
      assumeRunning: true,
    },
  );
  return (
    (completedTask as { notes?: string[] }).notes?.at(-1) ??
    "Delegated worker completed."
  );
}

export function resolveDelegationPriority(
  priority: string | undefined,
): "low" | "normal" | "high" | undefined {
  if (priority === "low" || priority === "normal" || priority === "high") {
    return priority;
  }
  return undefined;
}

export function createDelegationQueueCallbacks(
  context: AgentExecutionContext,
): {
  onComplete: (task: unknown) => Promise<void>;
  onError: (task: unknown, error: string) => Promise<void>;
} {
  return {
    onComplete: async (task: unknown) => {
      context.services.skillSynthesis.synthesizeFromTask(
        task as Parameters<
          typeof context.services.skillSynthesis.synthesizeFromTask
        >[0],
      );
    },
    onError: async (task: unknown, error: string) => {
      context.services.delegation.addNote(
        (task as { id: string }).id,
        `system: supervision error ${error}`,
      );
    },
  };
}
