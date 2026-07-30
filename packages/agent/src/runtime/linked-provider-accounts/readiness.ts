import { displayCommand } from "@/runtime/commands/command-execution";
import { resolveLinkedProviderCredentials } from "@/runtime/native/account-auth";
import { getRuntimeProviderAccountsSnapshot } from "@/runtime/native/provider-accounts";
import type { AgentExecutionContext } from "../chat";
import { validateCloudBaseUrl } from "./cloud-url";
import { normalizeElizaCloudBaseUrl } from "./messages";

const providerReadinessCache = new WeakMap<
  object,
  Map<string, { expiresAt: number; message: string | undefined }>
>();
const LOCAL_PROVIDER_READINESS_TIMEOUT_MS = 750;

function ollamaTagsUrl(baseUrl: string): string | undefined {
  try {
    const url = new URL(baseUrl);
    const path = url.pathname.replace(/\/+$/, "");
    url.pathname = path.endsWith("/api") ? `${path}/tags` : `${path}/api/tags`;
    return url.toString();
  } catch {
    return undefined;
  }
}

async function ollamaReadinessMessage(
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const settings = context.services.settings.get();
  const baseUrl =
    settings.model.provider === "ollama"
      ? settings.model.baseUrl
      : context.config.ollamaApiEndpoint;
  const tagsUrl = ollamaTagsUrl(baseUrl?.trim() ?? "");
  if (!tagsUrl) {
    return "Ollama is selected, but its local API address is invalid. Start Ollama or choose another provider in Settings.";
  }

  try {
    const response = await fetch(tagsUrl, {
      signal: AbortSignal.timeout(LOCAL_PROVIDER_READINESS_TIMEOUT_MS),
    });
    if (!response.ok) {
      return "Ollama is selected, but its local API is not responding. Start Ollama or choose another provider in Settings.";
    }

    const selectedModel = settings.model.model?.trim();
    if (!selectedModel) {
      return undefined;
    }
    const payload = (await response.json()) as {
      models?: Array<{ model?: string; name?: string }>;
    };
    if (!Array.isArray(payload.models)) {
      return undefined;
    }
    const selectedWithoutLatest = selectedModel.replace(/:latest$/, "");
    const installed = payload.models.some((entry) => {
      const candidate = (entry.name ?? entry.model ?? "").trim();
      return (
        candidate === selectedModel ||
        candidate.replace(/:latest$/, "") === selectedWithoutLatest
      );
    });
    if (!installed) {
      return `Ollama is running, but ${selectedModel} is not installed. Install that model or choose another provider in Settings.`;
    }
    return undefined;
  } catch {
    // The user-facing message below is intentionally stable and omits raw
    // network errors so local paths and provider details are not exposed.
  }

  return "Ollama is selected, but its local API is not responding. Start Ollama or choose another provider in Settings.";
}

export async function describeElizaCloudDoctorState(
  context: AgentExecutionContext,
): Promise<{
  configuredBaseUrl: string;
  normalizedBaseUrl: string;
  baseUrlValidation: string | null;
  credentialSource: string;
  authMode: string;
  hasApiKey: boolean;
}> {
  const settings = context.services.settings.get();
  const credentials = await resolveLinkedProviderCredentials("elizacloud");
  const fallbackBaseUrl =
    (settings.model.provider === "elizacloud"
      ? settings.model.baseUrl
      : context.config.elizaCloudBaseUrl) || resolveDefaultCloudBaseUrl();
  const configuredBaseUrl =
    (settings.model.provider === "elizacloud"
      ? settings.model.baseUrl
      : context.config.elizaCloudBaseUrl) || fallbackBaseUrl;
  const normalizedBaseUrl = normalizeElizaCloudBaseUrl(
    credentials && "baseUrl" in credentials
      ? credentials.baseUrl || configuredBaseUrl
      : configuredBaseUrl,
  );

  return {
    configuredBaseUrl,
    normalizedBaseUrl,
    baseUrlValidation: await validateCloudBaseUrl(normalizedBaseUrl),
    credentialSource:
      credentials && "source" in credentials && credentials.source?.trim()
        ? credentials.source
        : "missing",
    authMode:
      credentials && "authMode" in credentials && credentials.authMode?.trim()
        ? credentials.authMode
        : "missing",
    hasApiKey: Boolean(
      credentials && "apiKey" in credentials && credentials.apiKey?.trim(),
    ),
  };
}

function resolveDefaultCloudBaseUrl(): string {
  return normalizeElizaCloudBaseUrl();
}

function cacheProviderReadiness(
  runtimeKey: object,
  provider: string,
  message: string | undefined,
): void {
  const cache = providerReadinessCache.get(runtimeKey) ?? new Map();
  cache.set(provider, {
    expiresAt: Date.now() + 3_000,
    message,
  });
  providerReadinessCache.set(runtimeKey, cache);
}

export function getProviderReadinessMessage(
  context: AgentExecutionContext,
  provider: string,
): Promise<string | undefined> {
  const runtimeKey = context.runtime as object;
  const now = Date.now();
  const cachedReadiness = providerReadinessCache.get(runtimeKey)?.get(provider);
  if (cachedReadiness && cachedReadiness.expiresAt > now) {
    return Promise.resolve(cachedReadiness.message);
  }
  return computeProviderReadinessMessage(context, provider, runtimeKey);
}

async function computeProviderReadinessMessage(
  context: AgentExecutionContext,
  provider: string,
  runtimeKey: object,
): Promise<string | undefined> {
  let message: string | undefined;

  if (provider === "ollama") {
    message = await ollamaReadinessMessage(context);
    cacheProviderReadiness(runtimeKey, provider, message);
    return message;
  }

  const snapshot = getRuntimeProviderAccountsSnapshot(context.runtime);

  if (provider === "offline") {
    message = context.config.offlineBootstrapMode
      ? undefined
      : `No active model provider is configured. Run \`${displayCommand("/accounts")}\` to bind Eliza Cloud, Codex, Claude Code, or Devin, or set \`DOOLITTLE_OFFLINE_BOOTSTRAP=true\` for explicit bootstrap-only fallback replies.`;
    cacheProviderReadiness(runtimeKey, provider, message);
    return message;
  }

  if (provider === "openai" && !context.config.openAiApiKey?.trim()) {
    if (snapshot.codex.nativeReady || snapshot.codex.reusable) {
      message = [
        "OpenAI is selected, but OPENAI_API_KEY is not configured.",
        "A linked Codex account is ready on this machine.",
        `Run \`${displayCommand("/accounts use codex")}\` to activate it, or add OPENAI_API_KEY and try again.`,
      ].join(" ");
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
    message = `OpenAI is selected, but OPENAI_API_KEY is not configured. Add it in \`.env\` or run \`${displayCommand("/accounts")}\` to bind a linked provider.`;
    cacheProviderReadiness(runtimeKey, provider, message);
    return message;
  }

  if (provider === "anthropic" && !context.config.anthropicApiKey?.trim()) {
    if (snapshot.claudeCode.nativeReady || snapshot.claudeCode.reusable) {
      message = [
        "Anthropic is selected, but ANTHROPIC_API_KEY is not configured.",
        "A linked Claude Code account is ready on this machine.",
        `Run \`${displayCommand("/accounts use claude-code")}\` to activate it, or add ANTHROPIC_API_KEY and try again.`,
      ].join(" ");
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
    message = `Anthropic is selected, but ANTHROPIC_API_KEY is not configured. Add it in \`.env\` or run \`${displayCommand("/accounts")}\` to bind a linked provider.`;
    cacheProviderReadiness(runtimeKey, provider, message);
    return message;
  }

  if (provider === "elizacloud") {
    const cloudStatus = snapshot.elizaCloud;
    if (!(cloudStatus.nativeReady || cloudStatus.reusable)) {
      message = `Eliza Cloud is selected, but no managed cloud key is active in this workspace. Run \`elizaos login\`, then \`${displayCommand("/accounts connect elizacloud")}\` to bind the native cloud path.`;
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
  }

  if (provider === "codex") {
    const codexStatus = snapshot.codex;
    if (!(codexStatus.nativeReady || codexStatus.reusable)) {
      message = `Codex is selected, but no reusable Codex credentials are available. Run \`codex login\`, then \`${displayCommand("/accounts connect codex")}\` to bind it in Eliza.`;
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
  }

  if (provider === "claude-code") {
    const claudeStatus = snapshot.claudeCode;
    if (context.config.claudeCodeCliFallback && claudeStatus.fallbackReady) {
      cacheProviderReadiness(runtimeKey, provider, undefined);
      return undefined;
    }
    if (claudeStatus.nativeReady || claudeStatus.reusable) {
      cacheProviderReadiness(runtimeKey, provider, undefined);
      return undefined;
    }
    if (claudeStatus.fallbackReady) {
      message = `Claude Code is selected, but native Eliza auth material is still missing. Run \`claude setup-token\` to finish the native path, or enable the local Claude CLI fallback and run \`${displayCommand("/accounts connect claude-code")}\`.`;
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
    message = `Claude Code is selected, but no native Claude Code credentials are available. Run \`claude auth login\` or \`claude setup-token\`, then \`${displayCommand("/accounts connect claude-code")}\` to bind it in Eliza.`;
    cacheProviderReadiness(runtimeKey, provider, message);
    return message;
  }

  if (provider === "devin") {
    const devinStatus = snapshot.devin;
    if (!(devinStatus.nativeReady || devinStatus.reusable)) {
      message = `Devin is selected, but no active Devin CLI login is available. Run \`devin auth login\`, then \`${displayCommand("/accounts connect devin")}\` to bind SWE model execution.`;
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
  }

  cacheProviderReadiness(runtimeKey, provider, undefined);
  return undefined;
}
