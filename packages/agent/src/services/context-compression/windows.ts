export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "claude-opus-4-6": 1_000_000,
  "claude-sonnet-4-6": 1_000_000,
  "claude-sonnet-4-5": 1_000_000,
  "claude-sonnet-4-5-20250929": 1_000_000,
  "claude-opus-4-5": 200_000,
  "claude-opus-4-5-20251101": 200_000,
  "claude-opus-4-1": 200_000,
  "claude-opus-4-1-20250805": 200_000,
  "claude-sonnet-4-20250514": 1_000_000,
  "claude-opus-4-20250514": 200_000,
  "claude-3-5-haiku-20241022": 200_000,
  "claude-haiku-4-5-20251001": 200_000,
  "claude-3-5-haiku": 200_000,
  "claude-3-5-sonnet": 200_000,
  "claude-3-haiku-20240307": 200_000,
  "claude-3-haiku": 200_000,
  "claude-3-opus": 200_000,
  "claude-sonnet-4.6": 1_000_000,
  "claude-sonnet-4.5": 1_000_000,
  "claude-opus-4": 200_000,
  "gpt-5.4": 1_050_000,
  "gpt-5.4-mini": 400_000,
  "gpt-5.4-nano": 400_000,
  o3: 200_000,
  "o4-mini": 200_000,
  "o3-mini": 200_000,
  "gpt-4o": 128_000,
  "gpt-4.1": 1_000_000,
  "gpt-4.1-mini": 1_000_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  o1: 200_000,
  "o1-preview": 128_000,
  "o1-mini": 128_000,
  "gemini-3.1-pro-preview": 1_048_576,
  "gemini-3-flash-preview": 1_048_576,
  "gemini-3.1-flash-lite-preview": 1_048_576,
  "gemini-2.5-pro": 1_048_576,
  "gemini-2.5-flash": 1_048_576,
  "gemini-2.5-flash-lite": 1_048_576,
  "gemini-2.0-flash": 1_048_576,
  "gemini-2.0-flash-lite": 1_048_576,
  "meta-llama/Llama-4-Scout-17B-16E-Instruct": 10_000_000,
  "meta-llama/Llama-4-Maverick-17B-128E-Instruct": 1_000_000,
  "meta-llama/Llama-3.3-70B-Instruct": 128_000,
  "meta-llama/Llama-3.1-405B-Instruct": 128_000,
  "meta-llama/Llama-3.1-70B-Instruct": 128_000,
  "magistral-medium-2509": 40_000,
  "magistral-small-2509": 40_000,
  "mistral-large-3-25-12": 128_000,
  "mistral-medium-3-1-25-08": 128_000,
  "mistral-small-4-0-26-03": 128_000,
  "devstral-2-25-12": 128_000,
  "codestral-2508": 256_000,
  "anthropic/claude-sonnet-4-6": 1_000_000,
  "anthropic/claude-sonnet-4.6": 1_000_000,
  "anthropic/claude-sonnet-4.5": 1_000_000,
  "anthropic/claude-opus-4-6": 1_000_000,
  "openai/gpt-5-mini": 400_000,
  "openai/gpt-5.4": 1_050_000,
  "openai/gpt-5.4-mini": 400_000,
  "google/gemini-2.5-pro": 1_048_576,
  "google/gemini-3.1-pro-preview": 1_048_576,
  "meta-llama/llama-4-scout": 10_000_000,
  "meta-llama/llama-4-maverick": 1_000_000,
};

export const DEFAULT_CONTEXT_WINDOW = 128_000;

export function resolveContextWindow(modelId: string): number {
  if (MODEL_CONTEXT_WINDOWS[modelId]) {
    return MODEL_CONTEXT_WINDOWS[modelId];
  }
  for (const [key, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (modelId.includes(key) || key.includes(modelId)) {
      return size;
    }
  }
  return DEFAULT_CONTEXT_WINDOW;
}
