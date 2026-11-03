import type { BotDefinition } from "@doolittle/contracts/bots";
import type { SubscriptionAccountStatus } from "@elizaos/auth/auth/credentials";

const CONNECTION_ID_PATTERN =
  /^(openai-api|anthropic-api|openai-codex|anthropic-subscription):([a-zA-Z0-9][a-zA-Z0-9._-]{0,119})$/u;

export type TokenResolver = (
  provider: "openai-api" | "anthropic-api" | "openai-codex",
  accountId: string,
) => Promise<string | null>;

export type ProviderGrant =
  | { kind: "offline" }
  | { kind: "direct"; provider: "openai-api" | "anthropic-api"; token: string }
  | {
      kind: "native";
      provider: "openai-codex" | "anthropic-subscription";
      accountId: string;
    };

export function codexAccountId(accessToken: string): string {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString(
        "utf8",
      ),
    ) as Record<string, unknown>;
    const auth = payload["https://api.openai.com/auth"];
    if (auth && typeof auth === "object") {
      const id = (auth as Record<string, unknown>).chatgpt_account_id;
      if (typeof id === "string" && id.length > 0) return id;
    }
  } catch {
    // A malformed token must never be used against an unscoped account.
  }
  throw new Error("The selected Codex account is unavailable.");
}

export function assertClaudeSubscriptionAvailable(
  accountId: string,
  subscriptionStatus: () => SubscriptionAccountStatus[],
): void {
  const status = subscriptionStatus().find(
    (row) =>
      row.provider === "anthropic-subscription" &&
      row.accountId === accountId &&
      row.source === "claude-code-cli" &&
      row.configured &&
      row.valid &&
      row.available !== false,
  );
  if (!status)
    throw new Error("The selected Claude Code CLI account is unavailable.");
}

export async function resolveBotProviderGrant(
  definition: BotDefinition,
  tokenResolver: TokenResolver,
  subscriptionStatus: () => SubscriptionAccountStatus[],
): Promise<ProviderGrant> {
  const provider = definition.model.provider;
  if (provider === "offline") return { kind: "offline" };
  const expectedProvider =
    provider === "openai"
      ? "openai-api"
      : provider === "anthropic"
        ? "anthropic-api"
        : provider === "codex"
          ? "openai-codex"
          : provider === "claude-code"
            ? "anthropic-subscription"
            : null;
  if (!expectedProvider) {
    throw new Error(
      "This model route needs a scoped native provider grant before activation.",
    );
  }
  const references = definition.permissions.connectionIds.map((id) => {
    const match = CONNECTION_ID_PATTERN.exec(id);
    if (!match) throw new Error("A bot connection reference is invalid.");
    return { provider: match[1], accountId: match[2] };
  });
  const matches = references.filter(
    (reference) => reference.provider === expectedProvider,
  );
  if (matches.length !== 1 || !matches[0]?.accountId) {
    throw new Error(
      "Select exactly one approved account for this bot's model provider.",
    );
  }
  if (expectedProvider === "anthropic-subscription") {
    assertClaudeSubscriptionAvailable(matches[0].accountId, subscriptionStatus);
    return {
      kind: "native",
      provider: expectedProvider,
      accountId: matches[0].accountId,
    };
  }
  const token = await tokenResolver(expectedProvider, matches[0].accountId);
  if (!token) {
    throw new Error(
      "The selected bot connection is unavailable. Reconnect it and retry.",
    );
  }
  if (expectedProvider === "openai-codex") {
    codexAccountId(token);
    return {
      kind: "native",
      provider: expectedProvider,
      accountId: matches[0].accountId,
    };
  }
  return { kind: "direct", provider: expectedProvider, token };
}
