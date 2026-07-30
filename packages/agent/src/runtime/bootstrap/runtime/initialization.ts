import {
  installRuntimeMethodBindings,
  shutdownRuntime,
} from "@elizaos/agent/runtime";
import type { AgentRuntime } from "@elizaos/core";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import { validateCriticalRuntimeServices } from "./critical";

export interface ElizaRuntimeLifecycle {
  installRuntimeMethodBindings(runtime: AgentRuntime): void;
  shutdownRuntime(
    runtime: AgentRuntime | null | undefined,
    context: string,
    options?: { fast?: boolean },
  ): Promise<void>;
  validateRuntime(runtime: AgentRuntime): Promise<void>;
}

const officialElizaRuntimeLifecycle: ElizaRuntimeLifecycle = {
  installRuntimeMethodBindings,
  shutdownRuntime,
  validateRuntime: validateCriticalRuntimeServices,
};

/**
 * Initialize the composed Doolittle runtime through the official Eliza
 * lifecycle hooks, without a parallel host recovery loop.
 *
 * Eliza owns database startup, typed PGlite failures, plugin lifecycle, and
 * required manual-reset guidance. Doolittle owns the product character and
 * plugin composition, then installs Eliza's runtime bindings, records the
 * boundary, validates its required services, and delegates partial teardown
 * to Eliza's adapter-safe shutdown helper.
 */
export async function initializeElizaRuntime(
  createRuntime: () => AgentRuntime,
  lifecycle: ElizaRuntimeLifecycle = officialElizaRuntimeLifecycle,
): Promise<AgentRuntime> {
  const runtime = createRuntime();

  try {
    appendBootstrapTrace("phase:runtime.bindings:call");
    lifecycle.installRuntimeMethodBindings(runtime);
    appendBootstrapTrace("phase:runtime.bindings:done");
    appendBootstrapTrace("phase:runtime.initialize:call");
    await runtime.initialize();
    appendBootstrapTrace("phase:runtime.initialize:done");
    await lifecycle.validateRuntime(runtime);
    return runtime;
  } catch (error) {
    appendBootstrapTrace(
      "phase:runtime.initialize:error",
      error instanceof Error ? error.message : String(error),
    );
    try {
      await disposeRuntime(
        runtime,
        "Doolittle runtime initialization failure",
        lifecycle,
        { fast: true },
      );
    } catch (shutdownError) {
      appendBootstrapTrace(
        "phase:runtime.shutdown:error",
        shutdownError instanceof Error
          ? shutdownError.message
          : String(shutdownError),
      );
    }
    throw error;
  }
}

export async function disposeRuntime(
  runtime: AgentRuntime,
  context = "Doolittle runtime shutdown",
  lifecycle: Pick<
    ElizaRuntimeLifecycle,
    "shutdownRuntime"
  > = officialElizaRuntimeLifecycle,
  options?: { fast?: boolean },
): Promise<void> {
  await lifecycle.shutdownRuntime(runtime, context, options);
}
