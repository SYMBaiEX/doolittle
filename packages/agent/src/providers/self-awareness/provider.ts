import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import type { AppServices } from "@/services";

/**
 * Surfaces the agent's composed self-awareness summary into the runtime
 * provider context so the model can reason about its own operational state.
 *
 * The ElizaOS `AwarenessRegistry` (assembled by {@link AwarenessService} with
 * the runtime / run / startup / settings / capabilities contributors) produces
 * a Layer-1 summary via `composeSummary`. The registry is built at startup, but
 * nothing injected its output into a turn — this provider closes that gap.
 *
 * Additive and fault-tolerant: `composeSummary` already returns `""` on
 * contributor failure, and any throw is swallowed, so the turn is never broken
 * and nothing is injected when there is no summary to show.
 */
export function createSelfAwarenessProvider(services: AppServices): Provider {
  return {
    name: "DOOLITTLE_SELF_AWARENESS_PROVIDER",
    description:
      "Injects the agent's composed self-awareness summary (runtime, run, startup, settings, capabilities) into the runtime context.",
    // Render late, after the main Doolittle context block.
    position: 100,
    get: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
    ): Promise<ProviderResult> => {
      let summary = "";
      try {
        summary = (await services.awareness.composeSummary(runtime)).trim();
      } catch {
        summary = "";
      }

      if (!summary) {
        return { text: "", values: {}, data: {} };
      }

      return {
        text: summary,
        values: {},
        data: { selfAwareness: summary },
      };
    },
  };
}
