import { resolveCloudApiBaseUrl } from "@elizaos/autonomous/cloud/base-url";
import { displayCommand } from "@/runtime/commands/command-execution";

export const ELIZA_CLOUD_BILLING_URL =
  "https://www.elizacloud.ai/dashboard/settings?tab=billing";

const LEGACY_ELIZA_CLOUD_HOST_ALIASES = new Set([
  "elizacloud.ai",
  "www.elizacloud.ai",
]);

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("127.")
  );
}

function trimApiPath(pathname: string): string {
  const normalized = pathname.trim().replace(/\/+$/, "");
  if (!normalized || normalized === "/api/v1") {
    return "";
  }
  if (normalized.endsWith("/api/v1")) {
    return normalized.slice(0, -"/api/v1".length);
  }
  return normalized;
}

function normalizeExplicitElizaCloudSiteUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = trimApiPath(parsed.pathname);
    if (!isLoopbackHost(host)) {
      parsed.protocol = "https:";
      parsed.port = "";
    }
    if (LEGACY_ELIZA_CLOUD_HOST_ALIASES.has(host)) {
      parsed.hostname = "www.elizacloud.ai";
      parsed.pathname = "";
    }
    return parsed.toString().replace(/\/{1,1024}$/, "");
  } catch {
    const safeCandidate = raw.length > 8192 ? raw.slice(0, 8192) : raw;
    return safeCandidate
      .replace(/\/api\/v1\/?$/, "")
      .replace(/\/{1,1024}$/, "");
  }
}

export function normalizeElizaCloudBaseUrl(raw?: string): string {
  const explicitBaseUrl = raw?.trim();
  if (!explicitBaseUrl) {
    return resolveCloudApiBaseUrl();
  }
  return `${normalizeExplicitElizaCloudSiteUrl(explicitBaseUrl)}/api/v1`;
}

export function buildProviderNoResponseMessage(
  provider: string,
  model: string,
): string {
  if (provider === "elizacloud") {
    return `I couldn't get a usable response from Eliza Cloud (${model}). Run \`${displayCommand("/accounts doctor")}\` to verify the cloud bond, then \`${displayCommand("/accounts connect elizacloud")}\` if the workspace needs a fresh Cloud activation.`;
  }
  if (provider === "codex") {
    return `I couldn't get a usable response from Codex (${model}). Run \`${displayCommand("/accounts doctor")}\` to verify the linked account, then \`${displayCommand("/accounts connect codex")}\` if it needs a rebind.`;
  }
  if (provider === "claude-code") {
    return `I couldn't get a usable response from Claude Code (${model}). Run \`${displayCommand("/accounts doctor")}\` to verify the linked account, then \`${displayCommand("/accounts connect claude-code")}\` if it needs a rebind.`;
  }
  if (provider === "devin") {
    return `I couldn't get a usable response from Devin (${model}). Run \`${displayCommand("/accounts doctor")}\` to verify the local Devin login, then \`${displayCommand("/accounts connect devin")}\` if it needs a rebind.`;
  }
  if (provider === "openai") {
    return `I couldn't get a usable response from OpenAI (${model}). Check \`OPENAI_API_KEY\` or switch to a linked provider with \`${displayCommand("/accounts")}\`.`;
  }
  if (provider === "anthropic") {
    return `I couldn't get a usable response from Anthropic (${model}). Check \`ANTHROPIC_API_KEY\` or switch to a linked provider with \`${displayCommand("/accounts")}\`.`;
  }
  return `I couldn't get a usable response from the active provider. Run \`${displayCommand("/doctor")}\` or \`${displayCommand("/accounts")}\` to repair the runtime.`;
}

export function buildProviderFailureMessage(
  provider: string,
  model: string,
  error: unknown,
  baseUrl?: string,
): string {
  const detail =
    error instanceof Error ? error.message.trim() : String(error).trim();
  const normalized = detail.toLowerCase();
  const cloudBaseUrl = normalizeElizaCloudBaseUrl(baseUrl);

  if (
    normalized.includes("aborted") ||
    normalized.includes("aborterror") ||
    normalized.includes("signal is aborted")
  ) {
    return "The turn was cancelled before the provider finished responding.";
  }

  if (
    normalized.includes("failed query:") &&
    normalized.includes("relationships")
  ) {
    return `The Eliza runtime hit an internal relationships query error while building turn context. Retry the turn after startup finishes, and run \`${displayCommand("/doctor")}\` if it keeps happening.`;
  }

  if (
    normalized.includes("cannot connect to api") ||
    normalized.includes("unable to connect") ||
    normalized.includes("failedtoopensocket") ||
    normalized.includes("connectionrefused")
  ) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) is active, but I could not reach the Cloud API at \`${cloudBaseUrl}\`. Check network access and the configured base URL, then run \`${displayCommand("/accounts doctor")}\` for a provider-specific diagnosis.`;
    }
    return `The active provider (${provider}:${model}) could not be reached from this shell. Check network access and provider credentials, then run \`${displayCommand("/accounts doctor")}\`.`;
  }

  if (
    normalized.includes("typo in the url or port") ||
    normalized.includes("could not be resolved") ||
    normalized.includes("getaddrinfo") ||
    normalized.includes("dns")
  ) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) could not resolve the configured API base URL \`${cloudBaseUrl}\`. Compare \`ELIZAOS_CLOUD_BASE_URL\` with the native cloud path, then run \`${displayCommand("/accounts doctor")}\` to verify the normalized URL.`;
    }
    return `The active provider (${provider}:${model}) could not resolve its configured endpoint. Check the base URL/host configuration, then run \`${displayCommand("/accounts doctor")}\`.`;
  }

  if (
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("abortedsignal") ||
    normalized.includes("network timeout")
  ) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) timed out while waiting for \`${cloudBaseUrl}\`. Check latency or service availability, then run \`${displayCommand("/accounts doctor")}\` if it keeps happening.`;
    }
    return `The active provider (${provider}:${model}) timed out before returning a response.`;
  }

  if (normalized.includes("401") || normalized.includes("unauthorized")) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) rejected this request as unauthorized. Run \`${displayCommand("/accounts doctor")}\`, then \`${displayCommand("/accounts connect elizacloud")}\` or \`elizaos login\` to refresh the managed bond.`;
    }
    if (
      provider === "codex" ||
      provider === "claude-code" ||
      provider === "devin"
    ) {
      return `The linked ${provider} session for ${model} is no longer authorized. Run \`${displayCommand(`/accounts connect ${provider}`)}\` after refreshing the local login.`;
    }
  }

  if (normalized.includes("429") || normalized.includes("rate limit")) {
    return `The active provider (${provider}:${model}) is rate-limiting this request right now. Wait a moment or switch models with \`${displayCommand("/accounts")}\`.`;
  }

  if (
    normalized.includes("402") ||
    normalized.includes("payment required") ||
    normalized.includes("insufficient credits") ||
    normalized.includes("insufficient funds")
  ) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) rejected the request because the managed cloud account is out of credits or billing is blocked. Add credits in ${ELIZA_CLOUD_BILLING_URL} and rerun \`${displayCommand("/accounts doctor")}\` if the shell still reports Cloud auth issues.`;
    }
    return `The active provider (${provider}:${model}) rejected the request because the account is out of credits or billing is blocked.`;
  }

  if (
    normalized.includes("invalid cloud base url") ||
    normalized.includes("must use https") ||
    normalized.includes("blocked local hostname") ||
    normalized.includes("blocked address")
  ) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) is configured with an invalid base URL: \`${cloudBaseUrl}\`. Run \`${displayCommand("/accounts doctor")}\` and correct \`ELIZAOS_CLOUD_BASE_URL\` before retrying.`;
    }
  }

  if (normalized.includes("no output generated")) {
    return buildProviderNoResponseMessage(provider, model);
  }

  const compactDetail =
    detail.length > 220 ? `${detail.slice(0, 217)}...` : detail;
  return `${buildProviderNoResponseMessage(provider, model)} Last error: ${compactDetail}`;
}
