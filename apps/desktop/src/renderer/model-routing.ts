export type RouteProviderId =
  | "ollama"
  | "elizacloud"
  | "codex"
  | "claude-code"
  | "devin"
  | "openai"
  | "anthropic";

export interface RouteProviderOption {
  id: RouteProviderId;
  label: string;
  eyebrow: string;
  description: string;
  defaultModel: string;
  defaultBaseUrl?: string;
}

export interface LinkedProviderStatus {
  nativeReady?: boolean;
  fallbackReady?: boolean;
  reusable?: boolean;
  detail?: string;
}

export interface LinkedProviderAccountsLike {
  codex?: LinkedProviderStatus;
  claudeCode?: LinkedProviderStatus;
  devin?: LinkedProviderStatus;
  elizaCloud?: LinkedProviderStatus;
}

export interface ProviderReadinessSummary {
  detail: string;
  ready: boolean;
  tone: "bad" | "good" | "neutral" | "warn";
}

export const ROUTE_PROVIDER_OPTIONS: readonly RouteProviderOption[] = [
  {
    id: "ollama",
    label: "Ollama",
    eyebrow: "Local first",
    description:
      "Keep fast turns on this machine with an offline-capable route.",
    defaultModel: "granite4.1:3b",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
  },
  {
    id: "codex",
    label: "Codex",
    eyebrow: "Coding",
    description: "Use the linked Codex account for software-heavy work.",
    defaultModel: "gpt-5-codex",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    eyebrow: "Reasoning",
    description: "Route through the linked Claude Code CLI when it is ready.",
    defaultModel: "claude-opus-4.1",
  },
  {
    id: "devin",
    label: "Devin",
    eyebrow: "Agentic coding",
    description: "Prefer Devin when you want deeper autonomous coding help.",
    defaultModel: "devin",
  },
  {
    id: "elizacloud",
    label: "Eliza Cloud",
    eyebrow: "Managed",
    description: "Use Eliza Cloud when you want managed remote routing.",
    defaultModel: "gpt-5-mini",
  },
  {
    id: "openai",
    label: "OpenAI-compatible",
    eyebrow: "Custom endpoint",
    description: "Point Doolittle at a compatible endpoint you control.",
    defaultModel: "gpt-5-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    eyebrow: "Custom endpoint",
    description:
      "Use Anthropic-compatible credentials configured on this machine.",
    defaultModel: "claude-sonnet-4.5",
    defaultBaseUrl: "https://api.anthropic.com/v1",
  },
] as const;

export function routeProviderOption(
  provider: string | undefined,
): RouteProviderOption | undefined {
  return ROUTE_PROVIDER_OPTIONS.find((entry) => entry.id === provider);
}

export function defaultModelForProvider(
  provider: string | undefined,
  currentProvider: string | undefined,
  currentModel: string | undefined,
): string {
  if (
    provider &&
    currentProvider &&
    provider === currentProvider &&
    currentModel?.trim()
  ) {
    return currentModel.trim();
  }
  return (
    routeProviderOption(provider)?.defaultModel ?? currentModel?.trim() ?? ""
  );
}

export function defaultBaseUrlForProvider(
  provider: string | undefined,
  currentProvider: string | undefined,
  currentBaseUrl: string | undefined,
): string {
  if (
    provider &&
    currentProvider &&
    provider === currentProvider &&
    currentBaseUrl?.trim()
  ) {
    return currentBaseUrl.trim();
  }
  return routeProviderOption(provider)?.defaultBaseUrl ?? "";
}

export function providerReadiness(
  provider: string | undefined,
  accounts: LinkedProviderAccountsLike | null | undefined,
): ProviderReadinessSummary {
  if (provider === "ollama") {
    return {
      ready: true,
      tone: "good",
      detail:
        "Local runtime available from this desktop when Ollama is running.",
    };
  }

  if (provider === "openai" || provider === "anthropic") {
    return {
      ready: false,
      tone: "warn",
      detail: "Manual API credentials or a custom base URL are required.",
    };
  }

  const status =
    provider === "codex"
      ? accounts?.codex
      : provider === "claude-code"
        ? accounts?.claudeCode
        : provider === "devin"
          ? accounts?.devin
          : provider === "elizacloud"
            ? accounts?.elizaCloud
            : undefined;

  const ready = Boolean(
    status?.nativeReady || status?.fallbackReady || status?.reusable,
  );

  return {
    ready,
    tone: ready ? "good" : "warn",
    detail:
      status?.detail?.trim() ||
      (ready
        ? "Ready to route new turns."
        : "Account setup is still required."),
  };
}
