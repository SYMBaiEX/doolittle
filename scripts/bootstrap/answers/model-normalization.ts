export const DEFAULT_ELIZA_CLOUD_SMALL_MODEL =
  "xai/grok-4.1-fast-non-reasoning";
export const DEFAULT_ELIZA_CLOUD_LARGE_MODEL = "xai/grok-4.1-fast-reasoning";
export const DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL =
  "openai/text-embedding-3-small";

function normalizeModelChoice(
  value: string | null | undefined,
  fallback: string,
  aliases: ReadonlySet<string>,
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  return aliases.has(trimmed.toLowerCase()) ? fallback : trimmed;
}

export function normalizeElizaCloudLargeModel(value?: string | null): string {
  return normalizeModelChoice(
    value,
    DEFAULT_ELIZA_CLOUD_LARGE_MODEL,
    new Set([
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "anthropic/claude-sonnet-4.5",
      "anthropic/claude-sonnet-4.6",
      "xai/grok-4.20-multi-agent",
      "xai/grok-4.20-multi-agent-beta",
    ]),
  );
}

export function normalizeElizaCloudSmallModel(value?: string | null): string {
  return normalizeModelChoice(
    value,
    DEFAULT_ELIZA_CLOUD_SMALL_MODEL,
    new Set([
      "openai/gpt-5-mini",
      "anthropic/claude-haiku-4-5-20251001",
      "xai/grok-4-fast-reasoning",
      "xai/grok-4.1-fast-reasoning",
      "xai/grok-4.1-fast-reasoning-beta",
      "xai/grok-4.1-fast-non-reasoning-beta",
    ]),
  );
}

export function normalizeElizaCloudEmbeddingModel(
  value?: string | null,
): string {
  return normalizeModelChoice(
    value,
    DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL,
    new Set(["text-embedding-3-small", "openai/text-embedding-3-small"]),
  );
}
