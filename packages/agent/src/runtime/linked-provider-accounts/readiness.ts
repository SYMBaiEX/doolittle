import { validateCloudBaseUrl } from "@elizaos/agent/cloud/validate-url";
import { displayCommand } from "@/runtime/commands/command-execution";
import {
  getLinkedProviderAccountsSnapshot,
  resolveLinkedProviderCredentials,
} from "@/runtime/native/account-auth";
import type { AgentExecutionContext } from "../chat";
import { normalizeElizaCloudBaseUrl } from "./messages";

const providerReadinessCache = new WeakMap<
  object,
  Map<string, { expiresAt: number; message: string | undefined }>
>();

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
  const snapshot = getLinkedProviderAccountsSnapshot();
  let message: string | undefined;

  if (provider === "offline") {
    message = context.config.offlineBootstrapMode
      ? undefined
      : `No active model provider is configured. Run \`${displayCommand("/accounts")}\` to bind Eliza Cloud, Codex, or Claude Code, or set \`DOOLITTLE_OFFLINE_BOOTSTRAP=true\` for explicit bootstrap-only fallback replies.`;
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
    const credentials = await resolveLinkedProviderCredentials("elizacloud");
    const apiKey =
      credentials && "apiKey" in credentials ? credentials.apiKey?.trim() : "";
    if (!apiKey) {
      message =
        cloudStatus.nativeReady || cloudStatus.reusable
          ? `Eliza Cloud is selected, but the managed cloud credentials still look incomplete. Run \`${displayCommand("/accounts connect elizacloud")}\` to refresh the bond, or run \`elizaos login\` again if the local workspace key is stale.`
          : `Eliza Cloud is selected, but no managed cloud key is active in this workspace. Run \`elizaos login\`, then \`${displayCommand("/accounts connect elizacloud")}\` to bind the native cloud path.`;
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
  }

  if (provider === "codex") {
    const codexStatus = snapshot.codex;
    const credentials = await resolveLinkedProviderCredentials("codex");
    const accessToken =
      credentials && "accessToken" in credentials
        ? credentials.accessToken?.trim()
        : "";
    if (!accessToken) {
      message =
        codexStatus.nativeReady || codexStatus.reusable
          ? `Codex is selected, but the bound credentials still look incomplete. Run \`${displayCommand("/accounts connect codex")}\` to rebind them, or run \`codex login\` first if the local store is stale.`
          : `Codex is selected, but no reusable Codex credentials are available. Run \`codex login\`, then \`${displayCommand("/accounts connect codex")}\` to bind it in Eliza.`;
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
  }

  if (provider === "claude-code") {
    const claudeStatus = snapshot.claudeCode;
    const credentials = await resolveLinkedProviderCredentials("claude-code");
    const accessToken =
      credentials && "accessToken" in credentials
        ? credentials.accessToken?.trim()
        : "";
    if (!accessToken) {
      if (claudeStatus.fallbackReady) {
        message = `Claude Code is selected, but native Eliza auth material is still missing. Run \`claude setup-token\` to finish the native path, or \`${displayCommand("/accounts connect claude-code")}\` to activate the local Claude CLI fallback right now.`;
        cacheProviderReadiness(runtimeKey, provider, message);
        return message;
      }
      message = `Claude Code is selected, but no native Claude Code credentials are available. Run \`claude auth login\` or \`claude setup-token\`, then \`${displayCommand("/accounts connect claude-code")}\` to bind it in Eliza.`;
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
  }

  cacheProviderReadiness(runtimeKey, provider, undefined);
  return undefined;
}
