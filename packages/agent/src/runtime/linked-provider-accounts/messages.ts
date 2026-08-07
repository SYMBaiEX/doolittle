import {
  ProviderTransportError,
  providerErrorCodeForStatus,
} from "@doolittle/provider-transport";
import { displayCommand } from "@/runtime/commands/command-execution";
import { resolveCloudApiBaseUrl } from "./cloud-url";

export const ELIZA_CLOUD_BILLING_URL =
  "https://www.elizacloud.ai/dashboard/settings?tab=billing";

export const normalizeElizaCloudBaseUrl = resolveCloudApiBaseUrl;

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
  if (error instanceof ProviderTransportError) {
    return buildStructuredProviderFailureMessage(
      provider,
      model,
      error,
      baseUrl,
    );
  }

  const detail =
    error instanceof Error ? error.message.trim() : String(error).trim();
  if (error instanceof Error && error.name === "AbortError") {
    return "The turn was cancelled before the provider finished responding.";
  }
  const status = readErrorStatus(error);
  if (status !== undefined) {
    return buildStructuredProviderFailureMessage(
      provider,
      model,
      new ProviderTransportError(detail, {
        code: providerErrorCodeForStatus(status),
        provider,
        status,
        detail,
      }),
      baseUrl,
    );
  }
  if (error instanceof TypeError) {
    return buildStructuredProviderFailureMessage(
      provider,
      model,
      new ProviderTransportError(detail, {
        code: "unavailable",
        provider,
        detail,
        retryable: true,
        cause: error,
      }),
      baseUrl,
    );
  }

  const compactDetail =
    detail.length > 220 ? `${detail.slice(0, 217)}...` : detail;
  return `${buildProviderNoResponseMessage(provider, model)} Last error: ${compactDetail}`;
}

function readErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    cause?: unknown;
  };
  const status =
    typeof candidate.status === "number"
      ? candidate.status
      : typeof candidate.statusCode === "number"
        ? candidate.statusCode
        : undefined;
  return status ?? readErrorStatus(candidate.cause);
}

function buildStructuredProviderFailureMessage(
  provider: string,
  model: string,
  error: ProviderTransportError,
  baseUrl?: string,
): string {
  if (error.code === "cancelled") {
    return "The turn was cancelled before the provider finished responding.";
  }
  if (error.code === "no_output") {
    return buildProviderNoResponseMessage(provider, model);
  }
  if (
    error.code === "no_credentials" ||
    error.code === "unauthorized" ||
    error.code === "incompatible_provider"
  ) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) is not authorized for this workspace. Run \`${displayCommand("/accounts doctor")}\`, then \`${displayCommand("/accounts connect elizacloud")}\` or \`elizaos login\` to refresh the managed bond.`;
    }
    if (
      provider === "codex" ||
      provider === "claude-code" ||
      provider === "devin"
    ) {
      return `The linked ${provider} session for ${model} is not available or no longer authorized. Run \`${displayCommand(`/accounts connect ${provider}`)}\` after refreshing the local login.`;
    }
  }
  if (error.code === "rate_limited") {
    return `The active provider (${provider}:${model}) is rate-limiting this request right now. Wait a moment or switch models with \`${displayCommand("/accounts")}\`.`;
  }
  if (error.code === "payment_required") {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) rejected the request because the managed cloud account is out of credits or billing is blocked. Add credits in ${ELIZA_CLOUD_BILLING_URL} and rerun \`${displayCommand("/accounts doctor")}\` if the shell still reports Cloud auth issues.`;
    }
    return `The active provider (${provider}:${model}) rejected the request because the account is out of credits or billing is blocked.`;
  }
  if (error.code === "timeout") {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) timed out while waiting for \`${normalizeElizaCloudBaseUrl(baseUrl)}\`. Check latency or service availability, then run \`${displayCommand("/accounts doctor")}\` if it keeps happening.`;
    }
    return `The active provider (${provider}:${model}) timed out before returning a response.`;
  }
  if (error.code === "invalid_configuration") {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) is configured with an invalid base URL: \`${normalizeElizaCloudBaseUrl(baseUrl)}\`. Run \`${displayCommand("/accounts doctor")}\` and correct \`ELIZAOS_CLOUD_BASE_URL\` before retrying.`;
    }
    return `The active provider (${provider}:${model}) has invalid endpoint or model configuration. Run \`${displayCommand("/accounts doctor")}\` to repair it.`;
  }
  if (error.code === "unavailable") {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) is temporarily unavailable at \`${normalizeElizaCloudBaseUrl(baseUrl)}\`. Check service availability, then retry or run \`${displayCommand("/accounts doctor")}\`.`;
    }
    return `The active provider (${provider}:${model}) is temporarily unavailable. Retry the turn or run \`${displayCommand("/accounts doctor")}\`.`;
  }

  const detail = error.detail || error.message;
  const compactDetail =
    detail.length > 220 ? `${detail.slice(0, 217)}...` : detail;
  return `${buildProviderNoResponseMessage(provider, model)} Last error: ${compactDetail}`;
}
