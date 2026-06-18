import { resolveCloudApiBaseUrl } from "@elizaos/autonomous/cloud/base-url";
import { type IAgentRuntime, ModelType } from "@elizaos/core";
import {
  DEFAULT_ELIZA_CLOUD_BASE_URL,
  DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL,
  DEFAULT_ELIZA_CLOUD_MODEL,
  DEFAULT_ELIZA_CLOUD_SMALL_MODEL,
} from "./constants";

interface RuntimeModelSettings {
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export function getRuntimeProvider(
  runtime: IAgentRuntime | undefined,
): string | undefined {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return undefined;
    }
    const parsed = JSON.parse(raw) as {
      model?: { provider?: string };
    };
    return parsed.model?.provider;
  } catch {
    return undefined;
  }
}

export function getRuntimeModelSettings(
  runtime: IAgentRuntime | undefined,
): RuntimeModelSettings {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return {};
    }
    const parsed = JSON.parse(raw) as {
      model?: {
        model?: string;
        baseUrl?: string;
        temperature?: number;
        maxTokens?: number;
      };
    };
    return parsed.model ?? {};
  } catch {
    return {};
  }
}

export function getRuntimeStringSetting(
  runtime: IAgentRuntime | undefined,
  key: string,
): string | undefined {
  try {
    const raw = runtime?.getSetting(key);
    return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function getRuntimeNumberSetting(
  runtime: IAgentRuntime | undefined,
  key: string,
): number | undefined {
  const raw = getRuntimeStringSetting(runtime, key);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveElizaCloudEmbeddingEndpoint(
  runtime: IAgentRuntime,
): string {
  const configured = getRuntimeStringSetting(
    runtime,
    "ELIZAOS_CLOUD_EMBEDDING_URL",
  );
  const baseUrl = configured
    ? configured
    : resolveCloudApiBaseUrl(
        getRuntimeModelSettings(runtime).baseUrl ||
          DEFAULT_ELIZA_CLOUD_BASE_URL,
      );
  const normalized = baseUrl.trim().replace(/\/$/, "");
  return normalized.endsWith("/embeddings")
    ? normalized
    : `${normalized}/embeddings`;
}

export function resolveElizaCloudEmbeddingModel(
  runtime: IAgentRuntime,
): string {
  return (
    getRuntimeStringSetting(runtime, "ELIZAOS_CLOUD_EMBEDDING_MODEL") ||
    DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL
  );
}

export function resolveElizaCloudModelSelection(
  runtime: IAgentRuntime,
  preferredType: (typeof ModelType)[keyof typeof ModelType],
  prompt: string,
): string {
  const runtimeModel = getRuntimeModelSettings(runtime);
  const configuredSmall =
    getRuntimeStringSetting(runtime, "ELIZAOS_CLOUD_SMALL_MODEL") ||
    DEFAULT_ELIZA_CLOUD_SMALL_MODEL;
  const configuredLarge =
    runtimeModel.model ||
    getRuntimeStringSetting(runtime, "ELIZAOS_CLOUD_LARGE_MODEL") ||
    DEFAULT_ELIZA_CLOUD_MODEL;

  if (isStructuredPlannerPrompt(prompt)) {
    return configuredLarge;
  }

  switch (preferredType) {
    case ModelType.TEXT_SMALL:
    case ModelType.TEXT_REASONING_SMALL:
      return configuredSmall;
    default:
      return configuredLarge;
  }
}

export function isStructuredPlannerPrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const hasPlannerKeys =
    normalized.includes("thought") &&
    normalized.includes("providers") &&
    normalized.includes("action") &&
    normalized.includes("params") &&
    normalized.includes("isfinish");
  const hasJsonConstraint =
    normalized.includes("json") ||
    normalized.includes("schema") ||
    normalized.includes("valid object") ||
    normalized.includes("double quotes");
  return hasPlannerKeys || (hasJsonConstraint && normalized.includes("action"));
}
