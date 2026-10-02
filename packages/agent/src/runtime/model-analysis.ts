import { type ChatMessage, ModelType } from "@elizaos/core";
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
import type { ModelAnalysisImage } from "@/services/model-analysis-port";
import type { AutomationRuntimeOverrides } from "@/types/runtime";
import { applyRuntimeOverrides } from "./chat-turn/overrides";

export interface ModelAnalysisOptions {
  label: string;
  personalityId?: string;
  runtimeOverrides?: AutomationRuntimeOverrides;
  abortSignal?: AbortSignal;
  images?: readonly ModelAnalysisImage[];
}

export type ModelAnalysisContext = ProviderRuntimeSettingsContext;

const MAX_ANALYSIS_IMAGES = 4;
const MAX_ANALYSIS_IMAGE_BYTES = 10 * 1024 * 1024;

function snapshotImages(
  images: readonly ModelAnalysisImage[] | undefined,
): ModelAnalysisImage[] {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > MAX_ANALYSIS_IMAGES) {
    throw new Error("Model analysis accepts at most four images.");
  }
  let bytes = 0;
  return images.map((image) => {
    if (
      !(image?.data instanceof Uint8Array) ||
      !image.data.byteLength ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        image.mediaType,
      )
    ) {
      throw new Error("Model analysis requires supported image bytes.");
    }
    bytes += image.data.byteLength;
    if (bytes > MAX_ANALYSIS_IMAGE_BYTES) {
      throw new Error("Model analysis images exceed the 10 MiB total limit.");
    }
    // Protect an in-flight provider request from mutation by its caller.
    return { data: Uint8Array.from(image.data), mediaType: image.mediaType };
  });
}

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
  const images = snapshotImages(options.images);

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
    versionDigest: hashParts([
      images.length
        ? "doolittle-model-analysis-images-v1"
        : "doolittle-model-analysis-v1",
      options.label,
    ]),
  });
  promptCacheMetrics.recordPlan(cacheable.stats);

  const runtimeSettings = buildProviderRuntimeSettings(context, settings);
  const messages: ChatMessage[] | undefined = images.length
    ? [
        {
          role: "user",
          content: [
            { type: "text", text: cacheable.prompt },
            ...images.map((image) => ({
              type: "image" as const,
              image: image.data,
              mediaType: image.mediaType,
            })),
          ],
        },
      ]
    : undefined;
  const params = {
    prompt: cacheable.prompt,
    promptSegments: cacheable.promptSegments,
    providerOptions: cacheable.providerOptions,
    signal: options.abortSignal,
    ...(messages ? { messages } : {}),
  };

  const response: unknown = await runWithTurnRuntimeScope(
    context.runtime,
    {
      settings: runtimeSettings,
      personalityId: options.personalityId,
    },
    () => context.runtime.useModel(ModelType.TEXT_LARGE, params),
  );

  throwIfAborted(options.abortSignal);
  if (
    response &&
    typeof response === "object" &&
    "text" in response &&
    typeof response.text === "string"
  ) {
    return response.text;
  }
  return typeof response === "string" ? response : String(response ?? "");
}
