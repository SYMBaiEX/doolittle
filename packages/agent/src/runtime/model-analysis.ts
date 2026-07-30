import { ModelType } from "@elizaos/core";
import {
  buildProviderRuntimeSettings,
  type ProviderRuntimeSettingsContext,
} from "@/runtime/linked-provider-accounts";
import {
  buildCacheablePrompt,
  hashParts,
  promptCacheMetrics,
} from "@/runtime/prompt-cache";
import { runWithTurnRuntimeScope } from "@/runtime/turn-runtime-scope";
import type { AutomationRuntimeOverrides } from "@/types/runtime";
import { applyRuntimeOverrides } from "./chat-turn/overrides";

export interface ModelAnalysisOptions {
  label: string;
  personalityId?: string;
  runtimeOverrides?: AutomationRuntimeOverrides;
  abortSignal?: AbortSignal;
}

export type ModelAnalysisContext = ProviderRuntimeSettingsContext;

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("Model analysis was cancelled.");
  error.name = "AbortError";
  throw error;
}

/**
 * Runs a pure, non-conversational analysis through the selected Eliza model.
 *
 * This deliberately does not create a room, memory, run-controller record, or
 * session projection. Callers that need agent tools or durable conversation
 * state must use a named Action or a normal message turn instead.
 */
export async function runModelAnalysis(
  context: ModelAnalysisContext,
  prompt: string,
  options: ModelAnalysisOptions,
): Promise<string> {
  throwIfAborted(options.abortSignal);

  const settings = applyRuntimeOverrides(
    context.services.settings.get(),
    options.runtimeOverrides,
  );
  const cacheable = buildCacheablePrompt({
    // Browser/media callers supply their complete product prompt. Keeping it
    // volatile preserves its exact text while still routing construction and
    // observability through the shared prompt-cache contract.
    stableBlocks: [],
    volatile: prompt,
    provider: settings.model.provider,
    model: settings.model.model,
    versionDigest: hashParts(["doolittle-model-analysis-v1", options.label]),
  });
  promptCacheMetrics.recordPlan(cacheable.stats);

  const runtimeSettings = buildProviderRuntimeSettings(context, settings);
  const params = {
    prompt: cacheable.prompt,
    promptSegments: cacheable.promptSegments,
    providerOptions: cacheable.providerOptions,
    signal: options.abortSignal,
  };

  const response = await runWithTurnRuntimeScope(
    context.runtime,
    {
      settings: runtimeSettings,
      personalityId: options.personalityId,
    },
    () => context.runtime.useModel(ModelType.TEXT_LARGE, params),
  );

  throwIfAborted(options.abortSignal);
  return typeof response === "string" ? response : String(response ?? "");
}
