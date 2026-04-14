import type { AppServices } from "@/services";
import { getNativeServices, type RuntimeLike } from "../runtime";

export async function superviseEffectiveDelegationQueue(
  runtime: RuntimeLike,
  services: AppServices,
  runner: (task: unknown) => Promise<string>,
  options?: {
    concurrency?: number;
    filter?: Record<string, unknown>;
    onComplete?: (task: unknown) => Promise<void> | void;
    onError?: (task: unknown, error: string) => Promise<void> | void;
  },
) {
  return (
    (await getNativeServices(runtime).agentOrchestrator?.supervise?.(
      runner,
      options,
    )) ?? services.delegation.supervise(runner as never, options as never)
  );
}
