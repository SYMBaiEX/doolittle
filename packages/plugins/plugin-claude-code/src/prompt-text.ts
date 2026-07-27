import type { GenerateTextParams } from "@elizaos/core";

/**
 * Resolve the prompt text for a model request.
 *
 * The alpha SDK exposes a required prompt string for text generation.
 */
export function resolveModelPromptText(params: GenerateTextParams): string {
  return params.prompt ?? "";
}
