import { DOOLITTLE_AWARENESS_SERVICE } from "@doolittle/contracts";
import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";

interface AwarenessRuntimeService {
  composeSummary(runtime: IAgentRuntime): Promise<string>;
}

/**
 * Surfaces the agent's composed self-awareness summary into the runtime
 * provider context so the model can reason about its own operational state.
 *
 * The registered Doolittle awareness service owns the ElizaOS
 * `AwarenessRegistry` and its runtime / run / startup / settings / capabilities
 * contributors. This provider only projects the resulting Layer-1 summary into
 * the turn context.
 *
 * Additive and fault-tolerant: `composeSummary` already returns `""` on
 * contributor failure, and any throw is swallowed, so the turn is never broken
 * and nothing is injected when there is no summary to show.
 */
export function createSelfAwarenessProvider(): Provider {
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
        const service = runtime.getService(
          DOOLITTLE_AWARENESS_SERVICE,
        ) as AwarenessRuntimeService | null;
        summary = (await service?.composeSummary(runtime))?.trim() ?? "";
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
