/** Product default only; saved provider/model choices always take precedence. */
export const DEFAULT_MODEL_ROUTE = {
  provider: "codex",
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  baseUrl: "https://chatgpt.com/backend-api/codex",
} as const;
