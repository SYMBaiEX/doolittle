import type { AgentExecutionContext } from "@/runtime/chat";
import {
  executeDirectLocalIntent as executeDirectLocalIntentFromFallback,
  isHighConfidenceDirectLocalIntent,
  requiresModelSynthesisForLocalIntent,
  resolveDirectLocalIntent,
  shouldUseDirectLocalFallback,
} from "@/runtime/local-intent-fallback";
import type { ChatTurnRequest } from "@/types/runtime";
import type {
  DirectLocalIntentLoader,
  DirectLocalIntentLoaderDependencies,
} from "./types";

export function createDirectLocalIntentLoader(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  dependencies: DirectLocalIntentLoaderDependencies = {},
): () => Promise<DirectLocalIntentLoader> {
  let loaded = false;
  let directLocalIntent: unknown;
  const loadFallbackModule =
    dependencies.loadFallbackModule ??
    (async () => import("@/runtime/local-intent-fallback"));
  const resolveIntent = resolveDirectLocalIntent;

  return async () => {
    const fallbackModule = await loadFallbackModule();
    if (!loaded) {
      directLocalIntent = resolveIntent(input, context);
      loaded = true;
    }

    return {
      directLocalIntent,
      executeDirectLocalIntent:
        fallbackModule.executeDirectLocalIntent ??
        executeDirectLocalIntentFromFallback,
      isHighConfidenceDirectLocalIntent:
        fallbackModule.isHighConfidenceDirectLocalIntent ??
        isHighConfidenceDirectLocalIntent,
      requiresModelSynthesisForLocalIntent:
        fallbackModule.requiresModelSynthesisForLocalIntent ??
        requiresModelSynthesisForLocalIntent,
      shouldUseDirectLocalFallback:
        fallbackModule.shouldUseDirectLocalFallback ??
        shouldUseDirectLocalFallback,
    };
  };
}
