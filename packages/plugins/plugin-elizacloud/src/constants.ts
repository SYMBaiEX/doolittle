import { resolveCloudApiBaseUrl } from "@elizaos/autonomous/cloud/base-url";

export const DEFAULT_ELIZA_CLOUD_BASE_URL = resolveCloudApiBaseUrl();
export const DEFAULT_ELIZA_CLOUD_SMALL_MODEL =
  "xai/grok-4.1-fast-non-reasoning";
export const DEFAULT_ELIZA_CLOUD_MODEL = "xai/grok-4.1-fast-reasoning";
export const DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL =
  "openai/text-embedding-3-small";
export const ELIZA_CLOUD_EMPTY_RESPONSE_FALLBACK_MODEL =
  "xai/grok-4.1-fast-reasoning";
export const ELIZA_CLOUD_EMPTY_RESPONSE_MODEL_PREFIXES = ["openai/gpt-5"];
export const ELIZA_CLOUD_RESPONSES_MODEL_MARKERS = ["xai/grok-"];
