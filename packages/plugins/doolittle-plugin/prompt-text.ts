import type { GenerateTextParams } from "@elizaos/core";

/**
 * Resolve the prompt text for a model request.
 *
 * The beta SDK permits promptless requests, so provider adapters normalize
 * the optional field to the empty string.
 */
export function resolveModelPromptText(params: GenerateTextParams): string {
  return params.prompt ?? "";
}
