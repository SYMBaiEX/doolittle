import type { AgentRuntime } from "@elizaos/core";
import { shutdownElizaRuntime } from "../lifecycle/shutdown";
import { ApplicationSession } from "./session";

export { ApplicationSession, type ApplicationSessionPhase } from "./session";

// A process (or worker isolate) has one default profile owner. Construction is lazy.
const applicationSession = new ApplicationSession();

export function getApplicationSession(): ApplicationSession {
  return applicationSession;
}

/** Existing hosts can hand back runtime identity without bypassing its owner. */
export async function shutdownApplicationRuntime(
  runtime: AgentRuntime | null | undefined,
  reason: string,
  options: { fast?: boolean } = {},
): Promise<void> {
  if (!runtime) return;
  if (applicationSession.ownsRuntime(runtime)) {
    await applicationSession.dispose(reason, options);
    return;
  }
  await shutdownElizaRuntime(runtime, reason, options);
}
