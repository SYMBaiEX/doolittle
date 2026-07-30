import type { AgentRuntime } from "@elizaos/core";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import { validateCriticalRuntimeServices } from "./critical";

/**
 * Initialize the official Eliza runtime without a parallel host recovery loop.
 *
 * Eliza owns database startup, typed PGlite failures, plugin lifecycle, and
 * required manual-reset guidance. Doolittle only records the boundary,
 * validates its required services, and disposes a partially started runtime.
 */
export async function initializeElizaRuntime(
  createRuntime: () => AgentRuntime,
): Promise<AgentRuntime> {
  const runtime = createRuntime();

  try {
    appendBootstrapTrace("phase:runtime.initialize:call");
    await runtime.initialize();
    appendBootstrapTrace("phase:runtime.initialize:done");
    await validateCriticalRuntimeServices(runtime);
    return runtime;
  } catch (error) {
    appendBootstrapTrace(
      "phase:runtime.initialize:error",
      error instanceof Error ? error.message : String(error),
    );
    await disposeRuntime(runtime);
    throw error;
  }
}

export async function disposeRuntime(runtime: AgentRuntime): Promise<void> {
  try {
    await runtime.stop();
  } catch {
    // Best effort only.
  }
  try {
    await runtime.close();
  } catch {
    // Best effort only.
  }
}
