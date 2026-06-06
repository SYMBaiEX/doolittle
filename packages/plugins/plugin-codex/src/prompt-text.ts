import type { GenerateTextParams } from "@elizaos/core";

/**
 * Resolve the prompt text for a model request.
 *
 * ElizaOS 2.0 beta made `GenerateTextParams.prompt` optional: native v5 chat
 * paths emit `messages` and leave `prompt` undefined. Prompt-only providers
 * that previously read `params.prompt` directly would silently send empty
 * content on those paths, so fall back to concatenating message text when no
 * legacy prompt string is present.
 */
export function resolveModelPromptText(params: GenerateTextParams): string {
  if (typeof params.prompt === "string" && params.prompt.trim().length > 0) {
    return params.prompt;
  }
  return (params.messages ?? [])
    .map((message) => {
      const { content } = message;
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("");
      }
      return "";
    })
    .filter((entry) => entry.trim().length > 0)
    .join("\n");
}
