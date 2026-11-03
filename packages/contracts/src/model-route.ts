/** Product default only; saved provider/model choices always take precedence. */
export const DEFAULT_MODEL_ROUTE = {
  provider: "codex",
  model: "gpt-6-luna",
  reasoningEffort: "medium",
  baseUrl: "https://chatgpt.com/backend-api/codex",
} as const;

export const RUNTIME_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;
export type RuntimeReasoningEffort = (typeof RUNTIME_REASONING_EFFORTS)[number];

export function isRuntimeReasoningEffort(
  value: unknown,
): value is RuntimeReasoningEffort {
  return (
    typeof value === "string" &&
    (RUNTIME_REASONING_EFFORTS as readonly string[]).includes(value)
  );
}

/** Product IDs are distinct from SDK handler names and account-store providers. */
export const MODEL_PROVIDER_DEFINITIONS = {
  offline: { id: "offline", label: "Offline bootstrap", mode: "local" },
  ollama: { id: "ollama", label: "Ollama", mode: "local" },
  elizacloud: { id: "elizacloud", label: "Eliza Cloud", mode: "cloud" },
  codex: { id: "codex", label: "ChatGPT / Codex", mode: "linked" },
  "claude-code": { id: "claude-code", label: "Claude Code", mode: "linked" },
  openai: { id: "openai", label: "OpenAI", mode: "cloud" },
  anthropic: { id: "anthropic", label: "Anthropic", mode: "cloud" },
} as const;
export type ModelProviderId = keyof typeof MODEL_PROVIDER_DEFINITIONS;
export type ModelProviderDefinition =
  (typeof MODEL_PROVIDER_DEFINITIONS)[ModelProviderId];

export function modelProviderDefinition(
  provider: string | undefined,
): ModelProviderDefinition | undefined {
  return provider && Object.hasOwn(MODEL_PROVIDER_DEFINITIONS, provider)
    ? MODEL_PROVIDER_DEFINITIONS[provider as ModelProviderId]
    : undefined;
}

export function isModelProviderId(value: unknown): value is ModelProviderId {
  return (
    typeof value === "string" && modelProviderDefinition(value) !== undefined
  );
}

export const LINKED_MODEL_PROVIDER_IDS = [
  "elizacloud",
  "codex",
  "claude-code",
] as const;
export type LinkedModelProviderId = (typeof LINKED_MODEL_PROVIDER_IDS)[number];

/** Parse command aliases only; never normalize a persisted route through this. */
export function resolveLinkedModelProviderId(
  raw: string | undefined,
): LinkedModelProviderId | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === "codex") return "codex";
  if (value === "elizacloud" || value === "eliza-cloud" || value === "cloud")
    return "elizacloud";
  if (value === "claude-code" || value === "claude" || value === "claudecode")
    return "claude-code";
  return undefined;
}

/** SDK model-handler names, not product or account-provider IDs. */
export function sdkModelProviderForRoute(
  provider: string | undefined,
  claudeCliFallback = false,
): string | undefined {
  const id = provider?.trim();
  if (!id) return undefined;
  if (id === "claude-code")
    return claudeCliFallback ? "@doolittle/plugin-claude-code" : "anthropic";
  if (id === "codex") return "codex-cli";
  if (id === "elizacloud") return "elizaOSCloud";
  // Explicitly installed extension handlers keep their own identifiers.
  return id;
}

/** Persisted route IDs remain open so unavailable routes can be shown honestly. */
export interface RuntimeModelSettings {
  provider: string;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort?: RuntimeReasoningEffort;
}

export interface RuntimeModelReasoningOption {
  id: RuntimeReasoningEffort;
  label: string;
  description?: string;
}
export interface RuntimeModelReasoningCapability {
  default?: RuntimeReasoningEffort;
  options: RuntimeModelReasoningOption[];
}
export interface RuntimeModelOption {
  id: string;
  label: string;
  source: "configured" | "discovered";
  reasoning?: RuntimeModelReasoningCapability;
}
export interface RuntimeModelProvider {
  id: string;
  label: string;
  mode: "cloud" | "linked" | "local";
  ready: boolean;
  baseUrl?: string;
  /** Configured default, independent of discovery order or the active route. */
  defaultModel?: string;
  discovery: "configured" | "live" | "unavailable";
  detail: string;
  models: RuntimeModelOption[];
}
export type RuntimeModelCapabilityId =
  | "chat"
  | "research"
  | "image"
  | "speech"
  | "transcription";
export interface RuntimeModelCapability {
  id: RuntimeModelCapabilityId;
  label: string;
  modelType: string;
  handlerRegistered: boolean;
  state: "available" | "unavailable";
  detail: string;
}
export interface RuntimeModelsResponse {
  activeProvider: string;
  activeModel: string;
  activeReasoningEffort?: RuntimeReasoningEffort;
  refreshedAt: string;
  providers: RuntimeModelProvider[];
  capabilities: RuntimeModelCapability[];
}
